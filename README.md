# Dil Se Safar — YouTube Music Experience

A single-page Next.js website with the generated Indian auto-rickshaw illustration, animated vinyl record and glassmorphism player.

## Playback architecture

This version uses the official **YouTube IFrame Player API**.

There is:

- no Spotify OAuth
- no Google OAuth
- no user authentication in your app
- no audio files hosted by this project

The browser loads the public YouTube playlist into the official YouTube embedded player. Your visible UI controls that player.

## Setup

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
```

## Configure your public playlist

Put your public YouTube playlist ID in `.env.local`:

```env
NEXT_PUBLIC_YOUTUBE_PLAYLIST_ID=PLxxxxxxxxxxxxxxxx
NEXT_PUBLIC_YOUTUBE_PLAYLIST_URL=https://www.youtube.com/playlist?list=PLxxxxxxxxxxxxxxxx
```

For example, if your URL is:

```text
https://www.youtube.com/playlist?list=PLabc123
```

your ID is:

```text
PLabc123
```

## Important

Use a public playlist and videos that are embeddable. A video whose owner disables embedding cannot be played inside the website.

The first playback may need a user click because browsers restrict autoplay with sound.

The visible player is intentionally custom. The official YouTube player is loaded as a tiny playback surface and your UI controls it through the IFrame API.

## Changing the currently displayed song

The YouTube player is the source of truth for playlist position. The current project uses the playlist player directly, so Previous/Next works immediately.

For production, you can add YouTube IFrame API metadata polling to display the exact current title, author and thumbnail automatically for every playlist item. The current starter uses the supplied fallback artwork until you add that metadata layer.

## YouTube link

The top-right "YouTube Music" link opens the configured playlist directly in YouTube.

## YouTube policy

Do not extract/download YouTube audio or bypass the embedded player. Keep playback through the official YouTube player/API.
