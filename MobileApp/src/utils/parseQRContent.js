const splitOnce = (value, separator) => {
  const index = value.indexOf(separator);
  if (index === -1) {
    return [value, ""];
  }

  return [value.slice(0, index), value.slice(index + separator.length)];
};

const decodeValue = (value) => decodeURIComponent((value || "").replace(/\+/g, " ")).trim();

const parseQueryString = (query) =>
  query
    .split("&")
    .filter(Boolean)
    .reduce((accumulator, part) => {
      const [key, value] = splitOnce(part, "=");
      if (key) {
        accumulator[decodeValue(key).toLowerCase()] = decodeValue(value);
      }
      return accumulator;
    }, {});

const buildDisplayValue = (values) => values.filter(Boolean).join("\n").trim();

const parseEmail = (rawText) => {
  const emailPart = rawText.slice("mailto:".length);
  const [email, query] = splitOnce(emailPart, "?");
  const params = parseQueryString(query);

  return {
    type: "email",
    data: {
      email: decodeValue(email),
      subject: params.subject || "",
      body: params.body || "",
    },
    displayValue: buildDisplayValue([decodeValue(email), params.subject, params.body]),
  };
};

const parsePhone = (rawText) => {
  const phone = decodeValue(rawText.slice("tel:".length));

  return {
    type: "phone",
    data: { phone },
    displayValue: phone,
  };
};

const parseSms = (rawText) => {
  const normalized = rawText.startsWith("smsto:") ? rawText.slice("smsto:".length) : rawText.slice("sms:".length);

  if (rawText.startsWith("smsto:")) {
    const [phone, message] = splitOnce(normalized, ":");
    return {
      type: "sms",
      data: {
        phone: decodeValue(phone),
        message: decodeValue(message),
      },
      displayValue: buildDisplayValue([decodeValue(phone), decodeValue(message)]),
    };
  }

  const [phone, query] = splitOnce(normalized, "?");
  const params = parseQueryString(query);
  const message = params.body || params.message || "";

  return {
    type: "sms",
    data: {
      phone: decodeValue(phone),
      message,
    },
    displayValue: buildDisplayValue([decodeValue(phone), message]),
  };
};

const parseLocation = (rawText) => {
  const coordinates = rawText.slice("geo:".length).split("?", 1)[0];
  const [latitude = "", longitude = ""] = coordinates.split(",");

  return {
    type: "location",
    data: {
      latitude: decodeValue(latitude),
      longitude: decodeValue(longitude),
    },
    displayValue: buildDisplayValue([decodeValue(latitude), decodeValue(longitude)]),
  };
};

const parseMeCard = (rawText) => {
  const body = rawText.slice("MECARD:".length);
  const fields = body.split(";").reduce((accumulator, part) => {
    const [key, value] = splitOnce(part, ":");
    if (key && value) {
      accumulator[key.toUpperCase()] = decodeValue(value);
    }
    return accumulator;
  }, {});

  return {
    type: "vcard",
    data: {
      name: fields.N || "",
      phone: fields.TEL || "",
      email: fields.EMAIL || "",
    },
    displayValue: buildDisplayValue([fields.N || "", fields.TEL || "", fields.EMAIL || ""]),
  };
};

const parseVCard = (rawText) => {
  const fields = rawText.split(/\r?\n/).reduce((accumulator, line) => {
    const [keyPart, value] = splitOnce(line, ":");
    const key = keyPart.split(";")[0].toUpperCase();
    if (value) {
      accumulator[key] = decodeValue(value);
    }
    return accumulator;
  }, {});

  return {
    type: "vcard",
    data: {
      name: fields.FN || fields.N || "",
      phone: fields.TEL || "",
      email: fields.EMAIL || "",
    },
    displayValue: buildDisplayValue([fields.FN || fields.N || "", fields.TEL || "", fields.EMAIL || ""]),
  };
};

const parseCalendar = (rawText) => {
  const fields = rawText.split(/\r?\n/).reduce((accumulator, line) => {
    const [keyPart, value] = splitOnce(line, ":");
    const key = keyPart.split(";")[0].toUpperCase();
    if (value) {
      accumulator[key] = decodeValue(value);
    }
    return accumulator;
  }, {});

  return {
    type: "calendar",
    data: {
      summary: fields.SUMMARY || "",
      date: fields.DTSTART || "",
      location: fields.LOCATION || "",
    },
    displayValue: buildDisplayValue([fields.SUMMARY || "", fields.DTSTART || "", fields.LOCATION || ""]),
  };
};

export const parseQRContent = (rawText) => {
  const normalized = (rawText || "").trim();
  const lowerValue = normalized.toLowerCase();

  if (lowerValue.startsWith("http://") || lowerValue.startsWith("https://")) {
    return {
      type: "url",
      data: { url: normalized },
      displayValue: normalized,
    };
  }

  if (lowerValue.startsWith("mailto:")) {
    return parseEmail(normalized);
  }

  if (lowerValue.startsWith("tel:")) {
    return parsePhone(normalized);
  }

  if (lowerValue.startsWith("smsto:") || lowerValue.startsWith("sms:")) {
    return parseSms(normalized);
  }

  if (lowerValue.startsWith("geo:")) {
    return parseLocation(normalized);
  }

  if (normalized.startsWith("MECARD:")) {
    return parseMeCard(normalized);
  }

  if (upperStartsWith(normalized, "BEGIN:VCARD")) {
    return parseVCard(normalized);
  }

  if (upperStartsWith(normalized, "BEGIN:VEVENT")) {
    return parseCalendar(normalized);
  }

  return {
    type: "plain_text",
    data: { text: normalized },
    displayValue: normalized,
  };
};

const upperStartsWith = (value, prefix) => value.toUpperCase().startsWith(prefix);

export default parseQRContent;
