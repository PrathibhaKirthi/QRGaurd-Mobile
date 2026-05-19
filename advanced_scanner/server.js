const dns = require("dns").promises;
const express = require("express");
const ipaddr = require("ipaddr.js");
const { chromium } = require("playwright");

const app = express();
const port = process.env.PORT || 8001;
const navigationTimeout = Number(process.env.NAVIGATION_TIMEOUT_MS || 45000);
const maxTextLength = Number(process.env.MAX_TEXT_LENGTH || 6000);

app.use(express.json({ limit: "1mb" }));

function parseHttpUrl(value) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isBlockedIp(address) {
  try {
    const parsed = ipaddr.parse(address);
    const range = parsed.range();
    return [
      "unspecified",
      "broadcast",
      "multicast",
      "linkLocal",
      "loopback",
      "private",
      "reserved",
      "carrierGradeNat",
      "uniqueLocal",
    ].includes(range);
  } catch {
    return true;
  }
}

async function isBlockedHost(hostname) {
  // SANDBOX SAFETY
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized === "localhost") {
    return true;
  }

  if (ipaddr.isValid(normalized)) {
    return isBlockedIp(normalized);
  }

  let results;
  try {
    results = await dns.lookup(normalized, { all: true, verbatim: true });
  } catch {
    return false;
  }

  return results.some((result) => isBlockedIp(result.address));
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function classifyField(input) {
  // FORM FIELD SIGNALS
  const name = (input.name || input.id || input.placeholder || "").toLowerCase();
  const type = (input.type || "text").toLowerCase();

  if (type === "password" || name.includes("password")) return "password";
  if (name.includes("otp") || name.includes("code") || name.includes("2fa")) return "otp";
  if (name.includes("card") || name.includes("cvv") || name.includes("expiry")) return "payment";
  if (name.includes("email") || type === "email") return "email";
  return type;
}

async function clickSafeCommonElements(page) {
  // SAFE INTERACTION
  const labels = [
    "Accept",
    "Accept all",
    "Agree",
    "I agree",
    "Got it",
    "Continue",
    "Close",
    "No thanks",
  ];

  const clicked = [];
  for (const label of labels) {
    try {
      const locator = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).first();
      if (await locator.isVisible({ timeout: 800 })) {
        await locator.click({ timeout: 1200 });
        clicked.push(label);
        await page.waitForTimeout(500);
      }
    } catch {
    }
  }
  return clicked;
}

function buildRiskSignals(evidence) {
  // DYNAMIC RISK SIGNALS
  const signals = [];
  const finalHost = parseHttpUrl(evidence.final_url || "")?.hostname;
  const originalHost = parseHttpUrl(evidence.original_url || "")?.hostname;

  if (evidence.redirect_chain.length > 1) {
    signals.push("The page redirected before reaching the final destination.");
  }
  if (finalHost && originalHost && finalHost !== originalHost) {
    signals.push("The final destination host differs from the scanned URL host.");
  }
  if (evidence.form_fields.some((field) => field.type === "password")) {
    signals.push("A password field was detected on the final page.");
  }
  if (evidence.form_fields.some((field) => field.type === "payment")) {
    signals.push("Payment-related form fields were detected.");
  }
  if (evidence.downloads.length > 0) {
    signals.push("The page attempted to start a download.");
  }
  if (evidence.popups.length > 0) {
    signals.push("The page attempted to open a popup or new tab.");
  }
  if (evidence.navigation_error) {
    signals.push("The sandbox could not fully load the final destination.");
  }
  if (!evidence.final_url.startsWith("https://")) {
    signals.push("The final destination is not using HTTPS.");
  }

  return signals;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/scan-url", async (req, res) => {
  // PLAYWRIGHT SCAN ENTRY POINT
  const parsed = parseHttpUrl(req.body?.url || "");
  if (!parsed) {
    return res.status(400).json({ error: "A valid HTTP or HTTPS URL is required." });
  }

  if (await isBlockedHost(parsed.hostname)) {
    return res.status(400).json({ error: "Private, local, or reserved network targets are blocked." });
  }

  let browser;
  let context;
  let page;
  const networkUrls = [];
  const consoleErrors = [];
  const downloads = [];
  const popups = [];
  const redirectChain = [];

  try {
    // ISOLATED BROWSER
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox"],
    });

    context = await browser.newContext({
      permissions: [],
      acceptDownloads: false,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: false,
      viewport: { width: 1365, height: 768 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 QRGuardAdvancedScan/1.0",
    });

    page = await context.newPage();

    context.on("page", async (popup) => {
      popups.push(popup.url());
      await popup.close().catch(() => {});
    });

    page.on("request", (request) => {
      networkUrls.push(request.url());
    });

    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        consoleErrors.push(`${message.type()}: ${message.text()}`.slice(0, 400));
      }
    });

    page.on("download", async (download) => {
      downloads.push({
        suggested_filename: download.suggestedFilename(),
        url: download.url(),
      });
      await download.cancel().catch(() => {});
    });

    // REQUEST GUARD
    await page.route("**/*", async (route) => {
      const requestUrl = parseHttpUrl(route.request().url());
      if (requestUrl && (await isBlockedHost(requestUrl.hostname))) {
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });

    let response = null;
    let navigationError = null;
    try {
      response = await page.goto(parsed.toString(), {
        waitUntil: "domcontentloaded",
        timeout: navigationTimeout,
      });
    } catch (error) {
      navigationError = `${error.name}: ${error.message}`.slice(0, 500);
    }

    if (response) {
      let request = response.request();
      const chain = [];
      while (request) {
        chain.unshift(request.url());
        request = request.redirectedFrom();
      }
      redirectChain.push(...chain);
    }

    let safe_clicks = [];
    if (!navigationError) {
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      safe_clicks = await clickSafeCommonElements(page);
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    }

    const pageData = navigationError ? {
      title: "",
      visible_text: "",
      inputs: [],
      links: [],
      buttons: [],
    } : await page.evaluate((limit) => {
      const inputs = [...document.querySelectorAll("input, textarea, select")].slice(0, 40).map((input) => ({
        tag: input.tagName.toLowerCase(),
        type: input.getAttribute("type") || input.tagName.toLowerCase(),
        name: input.getAttribute("name") || "",
        id: input.getAttribute("id") || "",
        placeholder: input.getAttribute("placeholder") || "",
        autocomplete: input.getAttribute("autocomplete") || "",
      }));

      const links = [...document.querySelectorAll("a[href]")].slice(0, 50).map((link) => ({
        text: (link.textContent || "").trim().slice(0, 120),
        href: link.href,
      }));

      const buttons = [...document.querySelectorAll("button, input[type=button], input[type=submit]")]
        .slice(0, 40)
        .map((button) => (button.textContent || button.getAttribute("value") || "").trim().slice(0, 120));

      return {
        title: document.title || "",
        visible_text: (document.body?.innerText || "").replace(/\s+/g, " ").trim().slice(0, limit),
        inputs,
        links,
        buttons,
      };
    }, maxTextLength);

    const screenshot = navigationError ? null : await page.screenshot({ type: "png", fullPage: false });
    const pageUrl = page.url();
    const finalUrl = !pageUrl || pageUrl === "about:blank" ? parsed.toString() : pageUrl;
    const networkDomains = uniqueValues(
      networkUrls.map((url) => {
        try {
          return new URL(url).hostname;
        } catch {
          return null;
        }
      })
    ).slice(0, 80);

    // EVIDENCE PAYLOAD
    const evidence = {
      original_url: parsed.toString(),
      final_url: finalUrl,
      final_host: parseHttpUrl(finalUrl)?.hostname || "",
      page_title: pageData.title,
      visible_text_sample: pageData.visible_text,
      redirect_chain: uniqueValues(redirectChain.length ? redirectChain : [parsed.toString(), finalUrl]),
      form_fields: pageData.inputs.map((input) => ({
        tag: input.tag,
        type: classifyField(input),
        raw_type: input.type,
        name: input.name,
        id: input.id,
        placeholder: input.placeholder,
        autocomplete: input.autocomplete,
      })),
      buttons: pageData.buttons,
      links: pageData.links,
      network_domains: networkDomains,
      request_count: networkUrls.length,
      downloads,
      popups,
      console_errors: consoleErrors.slice(0, 20),
      safe_interactions: safe_clicks,
      navigation_error: navigationError,
      scanned_at: new Date().toISOString(),
    };
    evidence.risk_signals = buildRiskSignals(evidence);

    return res.json({
      evidence,
      screenshot_base64: screenshot ? screenshot.toString("base64") : null,
      screenshot_mime: screenshot ? "image/png" : null,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Playwright scan failed.",
      install_hint: error.message.includes("Executable doesn't exist")
        ? "Run `npm run install:browsers` inside advanced_scanner for local runs, or rebuild the Docker image with the matching Playwright base image."
        : undefined,
      detail: `${error.name}: ${error.message}`.slice(0, 500),
    });
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});

app.listen(port, () => {
  console.log(`QRGuard Advanced Scanner listening on ${port}`);
});
