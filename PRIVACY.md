# Privacy policy

Personal Dashboard is a self-hosted wall dashboard for personal, non-commercial use by its owner. It is not a
service offered to the public: every installation is run by one person for their own accounts.

## What the app accesses

When the owner connects an account, the app asks for read access to:

- **Google Calendar:** the list of calendars and their events (`calendar.calendarlist.readonly`,
  `calendar.events.readonly`), plus the stable account identifier (`openid`). The app cannot create, change or
  delete events.
- **Microsoft To Do:** the task lists and tasks of a personal Microsoft account (`Tasks.ReadWrite`, `User.Read`,
  `offline_access`). The only change the app ever makes is marking a task completed or not completed.

## How the data is used and stored

- The data is shown on the owner's own display and nowhere else. It is not sold, shared, used for advertising or
  used to train models, and no human reads it.
- Access and refresh tokens are stored encrypted (AES-GCM) in the owner's own Cloudflare account. Cached
  events and tasks are stored there encrypted as well, for at most six hours.
- The tablet keeps the last received events and tasks in its browser storage so they stay visible while offline.
- Nothing is sent to any third party except the provider the data comes from (Google or Microsoft) and the
  hosting provider (Cloudflare) that runs the owner's installation.

## Google API Services User Data Policy

The use and transfer of information received from Google APIs to any other app adheres to the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
including the Limited Use requirements.

## Deleting data

The owner can delete a connected account with `npm run accounts -- <host> --delete-account <id> --yes`, which
removes its tokens and cached data, and can revoke the app's access in the Google or Microsoft account security
settings at any time.

## Contact

Questions: open an issue in this repository (see [SECURITY.md](SECURITY.md) for vulnerability reports).
