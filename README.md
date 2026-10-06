# Luke & Gizelle Wedding Website
- Live Site: https://luke-and-gizelle-wedding.onrender.com/

## Frontend

- HTML
- CSS
- JavaScript
- Vite

## Backend

- JavaScript
- Node.js
- Express.js
- MongoDB
- Nodemailer

## Deployment

Hosted on Render as a Web Service from the `main` branch.

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables: `MONGODB_URI`, `ADMIN_KEY`, `SMTP_USER`, `SMTP_PASS`
- Render sets `PORT` itself, so that variable stays out of the dashboard
- The free instance sleeps after about 15 minutes without visitors, so the first visit after that is slow

## RSVP

- Saves each response to MongoDB
- Updates the saved RSVP if the same guest submits again
- Sends a Gmail notification through Nodemailer
