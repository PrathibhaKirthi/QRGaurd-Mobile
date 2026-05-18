# QRGuard

QRGuard is a mobile QR code security app that scans QR codes, checks URL risk, explains scan results, supports advanced sandbox analysis, and generates QR codes only after a safety check.

The project includes a React Native Expo mobile app, a Flask backend, and an optional sandbox scanner service for advanced URL analysis.

## Main Features

- Scan QR codes using the mobile camera
- Detect URLs, plain text, email, phone, SMS, contact cards, locations, and calendar QR codes
- Classify URL scans as Safe, Suspicious, or Unsafe
- Show risk score, confidence, explanation summary, and feature contributions
- Detect attack patterns such as brand impersonation, credential harvesting, typosquatting, redirects, and suspicious links
- Run advanced sandbox scans for deeper URL evidence
- Generate QR codes only after QRGuard confirms the URL is safe
- Store scan history locally on the device
- Allow users to report suspicious physical QR codes

## Tech Stack

- React Native Expo
- TypeScript
- Flask
- SQLAlchemy
- Python
- Node.js / Playwright
- AsyncStorage
- react-native-qrcode-svg
- Google Web Risk API
- Gemini API for advanced scan analysis

## Project Structure

```text
QRGuard/
├── MobileApp/
│   ├── src/screens/             # Scanner, history, and QR generator screens
│   ├── src/components/          # Reusable mobile UI components
│   ├── src/services/            # API and notification logic
│   ├── src/utils/               # QR content parsing
│   ├── src/types/               # TypeScript types
│   ├── storage/                 # Local scan history storage
│   └── assets/                  # App images and logos
│
├── backend/
│   ├── model/                   # URL feature extraction, rules, attack classification, fusion, and explanations
│   ├── routes/                  # Flask API routes
│   ├── app.py                   # Backend app entry point
│   ├── scan_service.py          # Main scan logic
│   └── advanced_scan_service.py # Advanced scan analysis logic
│
├── advanced_scanner/
│   ├── server.js                # Browser sandbox scanner
│   ├── Dockerfile               # Deployment container
│   └── package.json
│
└── tests/                       # Backend tests
Key Files
MobileApp/src/screens/ScannerScreen.tsx

Main QR scanner screen.
MobileApp/src/screens/QRGeneratorScreen.tsx

Safe QR code generator screen.
MobileApp/src/screens/HistoryScreen.tsx

Local scan history screen.
MobileApp/storage/historyStorage.js

Local history storage using AsyncStorage.
MobileApp/src/utils/parseQRContent.js

Detects what type of QR content was scanned.
backend/routes/scan.py

Backend /scan endpoint.
backend/scan_service.py

Main backend scan pipeline.
backend/model/feature_extractor.py

Extracts URL features.
backend/model/url_rules_model.py

Applies rule-based URL risk checks.
backend/model/attack_classifier.py

Detects the type of suspicious attack pattern.
backend/model/fusion_model.py

Combines risk scores into one final verdict.
backend/model/xai_explainer.py

Creates readable explanations for scan results.
advanced_scanner/server.js

Runs browser-based sandbox analysis for advanced scans.
