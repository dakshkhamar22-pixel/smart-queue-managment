# Smart Queue Management System

A web-based queue management system that allows users to take tokens online, view live queue status, and receive notifications when their turn comes. Includes an admin dashboard for queue management.

## Features

- **Take Token Online** — Users enter name and phone to get a queue token
- **Live Queue Status** — Real-time display of currently serving token, next up, and waiting list
- **Token Number Display** — Clear display of assigned token numbers
- **Estimated Waiting Time** — Calculated based on queue position and average service time
- **Notification When Turn Comes** — Browser notifications and visual alerts when it's the user's turn
- **Admin Dashboard** — Call next token, view all tokens, cancel tokens, reset queue

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express
- **Database:** MongoDB (via Mongoose)

## Project Structure

```
├── backend/
│   ├── server.js           # Express server setup
│   ├── models/
│   │   ├── Token.js        # Token schema
│   │   └── Counter.js      # Auto-increment counter
│   └── routes/
│       └── tokens.js       # API routes
├── frontend/
│   ├── index.html          # User-facing page
│   ├── css/
│   │   └── style.css       # Shared styles
│   ├── js/
│   │   ├── app.js          # User-facing logic
│   │   └── admin.js        # Admin dashboard logic
│   └── admin/
│       └── index.html      # Admin dashboard page
├── tests/
│   └── tokens.test.js      # API tests
├── package.json
└── .env.example
```

## Getting Started

### Prerequisites

- Node.js (v16+)
- MongoDB (running locally or via a cloud service)

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `MONGODB_URI` | `mongodb://localhost:27017/smart-queue` | MongoDB connection string |
| `AVG_SERVICE_TIME_MINUTES` | `5` | Average minutes per token (for wait estimation) |

### Running

```bash
npm start
```

Visit `http://localhost:3000` for the user interface and `http://localhost:3000/admin` for the admin dashboard.

### Testing

```bash
npm test
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/tokens` | Create a new token |
| `GET` | `/api/tokens/status` | Get live queue status |
| `GET` | `/api/tokens/:tokenNumber/check` | Check token status and notifications |
| `GET` | `/api/tokens/admin/all` | Get all tokens (admin) |
| `POST` | `/api/tokens/admin/next` | Call next token (admin) |
| `POST` | `/api/tokens/admin/reset` | Reset entire queue (admin) |
| `PATCH` | `/api/tokens/admin/:tokenNumber/cancel` | Cancel a token (admin) |
