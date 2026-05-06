# QRGuard Advanced Scanner
Playwright service used by the Flask backend for Advanced Scan.

## Local Run

```bash
cd advanced_scanner
npm install
npm run install:browsers
npm start
```

The service listens on `PORT`, defaulting to `8001`.

## Docker

```bash
docker build --no-cache -t qrguard-advanced-scanner .
docker run -p 8001:8001 qrguard-advanced-scanner
```

Set the Flask backend `ADVANCED_SCANNER_URL` to the service.
