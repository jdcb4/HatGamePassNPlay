# Deployment

## Web: Self-Hosted Docker

The web app is a static Expo export served by Nginx.

Build image:

```bash
npm run docker:build
```

This builds both `jdcb4/hat-game-pass-n-play:<version>` and `jdcb4/hat-game-pass-n-play:latest`.

Run locally:

```bash
npm run docker:run
```

Open:

```text
http://localhost:8080
```

Manual Docker commands:

```bash
docker run --rm -p 8080:80 jdcb4/hat-game-pass-n-play:latest
```

For a server deployment:

1. Install Docker on the host.
2. Clone the repo.
3. Build the image.
4. Run it behind a reverse proxy such as Nginx, Caddy, or Traefik.
5. Terminate HTTPS at the reverse proxy.
6. Add a health check against `/`.

No backend process or database is required.

## iOS And Android: Recommended Path

Use Expo Application Services (EAS). This avoids needing to maintain native build machines locally.

Install and log in:

```bash
npm install -g eas-cli
eas login
```

One-time project setup:

```bash
eas build:configure
```

Preview builds:

```bash
eas build --platform android --profile preview
eas build --platform ios --profile preview
```

Production builds:

```bash
eas build --platform android --profile production
eas build --platform ios --profile production
```

## What I Need From You For Mobile Deployment

### Apple

- Apple Developer Program membership.
- Apple ID with App Store Connect access.
- Bundle identifier confirmation: currently `com.hatgame.passandplay`.
- App name, subtitle, description, keywords, support URL, privacy policy URL.
- App icon and screenshots.
- Decision on TestFlight testers.

### Google Play

- Google Play Console account.
- Package name confirmation: currently `com.hatgame.passandplay`.
- App name, short description, full description.
- App icon, feature graphic, screenshots.
- Content rating questionnaire answers.
- Privacy policy URL.
- Internal testing track testers.

## Testing Before Store Submission

Recommended minimum:

- `npm run typecheck`
- `npm test`
- `npm run build:web`
- Docker smoke test at `http://localhost:8080`
- Android preview build installed on at least one physical device.
- iOS TestFlight build installed on at least one physical device.
- Airplane-mode smoke test after install.

## Notes

- Do not commit generated signing keys or credentials.
- Do not commit generated native `ios` or `android` folders unless the project intentionally moves away from managed Expo.
- Store submissions require final art assets and privacy/support URLs before they can be completed.
