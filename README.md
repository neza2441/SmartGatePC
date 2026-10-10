# SmartGate PC Verification

SmartGate PC is a role-based campus computer registration and gate-verification system for RP College. Students register their computers and present QR codes; gate officers verify devices; administrators review registrations and monitor campus activity.

## System at a glance

- **Frontend:** React 19 and Vite 8 single-page application. Navigation is reflected in the browser URL, and layouts adapt to phone, tablet, and desktop screens.
- **Backend:** Laravel 12 REST API with Sanctum bearer-token authentication and role-based access control.
- **Database:** PostgreSQL. The local workstation configuration uses the `smartgate` database and `smartgate_app` role.
- **QR verification:** Device QR tokens are signed and do not expose the device serial number. Gate checks are recorded with the responsible officer.

## User workflows

| Role | Available workflows |
| --- | --- |
| Student | Register a computer, view registration status and device history, and open or download a device QR code. |
| Gate officer | Verify a QR token or serial number, review verification history, and inspect flagged attempts. |
| Administrator | Manage accounts for all roles, manage PCs, approve or reject registrations, review verification logs, and view reports. |

The Settings, Help & support, and User profile screens are available to each signed-in role. Users can edit their own name, email, student ID (students only), and password without changing their role. Profile photos are stored locally in that browser. Help links lead to role-specific screens; the support link opens an email to `smartgate@rp.ac.rw` in the user's configured mail application.

## Project structure

```text
backend-v12/   Active Laravel 12 API, migrations, seeders, and feature tests
frontend/      React/Vite application
backend/       Separate legacy backend scaffold; not used by the commands below
```

Use `backend-v12` for all API, migration, seeding, and test commands in this guide.

## Requirements

For the local Windows development setup:

- PHP 8.3 with the `pdo_pgsql` extension enabled
- Composer
- PostgreSQL 18, with the application database and role configured
- Node.js and npm compatible with Vite 8
- PowerShell

PHP 8.3 is installed separately from XAMPP on the configured workstation. The commands below use that executable so the older XAMPP PHP version does not need to be changed.

## Run locally on Windows

### 1. Configure Laravel

Open a PowerShell terminal at the repository root. For a fresh checkout, install dependencies and create the Laravel environment file if one is not already present:

```powershell
$php = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'
if (!(Test-Path $php)) { $php = (Get-Command php -ErrorAction Stop).Source }
$env:Path = "$(Split-Path $php);$env:Path"
Push-Location backend-v12
composer install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

For a new `.env`, set `SMARTGATE_DEMO_PASSWORD` to a strong local-only password and make sure the `DB_*` values point to a PostgreSQL database and role you have provisioned. The following command generates an application key only when `APP_KEY` is empty, then migrates and seeds:

```powershell
if (-not (Select-String -Path .env -Pattern '^APP_KEY=.+')) { & $php artisan key:generate }
& $php artisan migrate --seed
& $php artisan serve --host=127.0.0.1 --port=8000
```

Keep this terminal running. The seeder creates demo users and sample devices only when `APP_ENV=local` and `SMARTGATE_DEMO_PASSWORD` is set. It does not configure PostgreSQL for you. The trusted-localhost database authentication used on the original workstation is machine-specific; a different machine must configure PostgreSQL authentication and permissions independently.

### 2. Start the React frontend

Open a second PowerShell terminal at the repository root:

```powershell
Push-Location frontend
npm install
npm run dev -- --host 127.0.0.1
```

Keep this terminal running and open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). Vite forwards `/api` requests to the Laravel server at `http://127.0.0.1:8000`. QR scanning requires browser camera permission; localhost is a secure context for local development.

After signing in, application screens use hash routes such as `#/overview`, `#/verify`, `#/users`, `#/settings`, and `#/support`. The routes available depend on the signed-in role. The old administrator `#/students` link redirects to `#/users`.

## Free-tier deployment

The root `render.yaml` defines a Render Docker web service for the Laravel API and a Render static site for the React frontend. Use a free Neon PostgreSQL database for the database; Render's free web service can sleep when idle, so expect a cold start and do not rely on it for time-critical gate operations.

1. Push this project to a GitHub repository, create a free Neon PostgreSQL project, and copy its connection details.
2. In Render, create a Blueprint from that repository and provide the prompted database host, database name, username, and password.
3. Set `APP_KEY` to the output of `php artisan key:generate --show` from `backend-v12`. Do not commit this key or put it in the frontend.
4. Deploy both services. The blueprint connects the frontend API URL and backend CORS origin automatically. The API container runs production migrations at startup.
5. Create the first administrator account securely using the Render Shell and Laravel Artisan; do not run the local demo seeder in production.

The frontend uses the local Vite proxy when `VITE_API_BASE_URL` is unset and the deployed API origin when Render supplies it. QR camera scanning requires the deployed site to use HTTPS, which Render provides.

## Local demo accounts

When the local seeder runs, it creates these accounts:

| Role | Email |
| --- | --- |
| Student | `alice@smartgate.test` |
| Gate officer | `emmanuel@smartgate.test` |
| Administrator | `diane@smartgate.test` |

The password for all seeded accounts is the value of `SMARTGATE_DEMO_PASSWORD` in `backend-v12/.env`. The application does not provide a universal demo password; use the value configured for this environment. These accounts and their password are for local development only. Never deploy them or share the local password.

## API overview

All API routes are prefixed with `/api`. Protected routes require a Sanctum bearer token issued by login or registration.

| Method | Endpoint | Access |
| --- | --- | --- |
| `POST` | `/auth/register` | Public; creates a student account. |
| `POST` | `/auth/login` | Public; issues a bearer token. |
| `GET` | `/auth/me` | Signed-in user. |
| `PATCH` | `/auth/profile` | Signed-in user; edit own profile details without changing role. |
| `DELETE` | `/auth/logout` | Signed-in user; revokes the current token. |
| `GET` | `/devices` | Student (own devices) or administrator (all devices). |
| `POST` | `/devices` | Student; registers a PC for review. |
| `GET` | `/devices/{computer}/qr` | Device owner or administrator. |
| `GET` | `/my-verifications` | Student; own verification history. |
| `POST` | `/gate/verify` | Gate officer; verifies a serial number or QR token. |
| `GET` | `/verification-logs` | Gate officer. |
| `GET`, `POST` | `/admin/users` | Administrator; list or create accounts across all supported roles. |
| `GET`, `POST` | `/admin/students` | Administrator; student-only directory and legacy account-creation endpoint. |
| `PATCH`, `DELETE` | `/admin/users/{user}` | Administrator; update or delete a user account. The active and last administrator cannot be deleted or demoted. |
| `GET` | `/admin/logs` | Administrator. |
| `GET` | `/admin/reports` | Administrator. |
| `PATCH` | `/admin/devices/{computer}` | Administrator; edit owner, manufacturer, model, serial number, and review status. |
| `PATCH` | `/admin/devices/{computer}/status` | Administrator; update a PC's review status. |
| `DELETE` | `/admin/devices/{computer}` | Administrator; remove a PC. |

Login requests are rate-limited. Device registration enforces unique serial numbers, and administrator-only operations are protected by backend role middleware, not just frontend navigation.

## Tests and quality checks

Run backend feature tests using the same PHP 8.3 executable:

```powershell
$php = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'
if (!(Test-Path $php)) { $php = (Get-Command php -ErrorAction Stop).Source }
Push-Location backend-v12
& $php artisan test
```

The PHPUnit configuration targets a separate PostgreSQL database named `smartgate_test`. The test suite uses Laravel's `RefreshDatabase`, which resets test data in that database. Create the test database and grant the configured test role permission before running the suite. Do not point the test configuration at a database containing records you need to keep.

Run frontend checks from `frontend/`:

```powershell
Push-Location frontend
npm run build
npm run lint
Pop-Location
```

Useful Laravel diagnostics include `& $php artisan route:list --path=api` and `& $php artisan migrate:status` from `backend-v12/`. Define `$php` as shown in the test command in each new PowerShell terminal before using these commands.

## Security and deployment limits

- The application checks registration records and verifies signed QR tokens; it does not authenticate a computer serial number with its manufacturer. OEM authenticity checks require authorized manufacturer integrations.
- Sanctum bearer tokens are configured to expire after 24 hours and are revoked when the user signs out.
- Local demo users, local database credentials, trusted-host authentication, and development secrets are not suitable for production.
- A real deployment needs HTTPS, production-grade database authentication and permissions, protected application secrets, backups, monitoring, an approved student identity source, and an operational account-provisioning process.
- Configure and test production token lifetime, rate limits, logging, and recovery procedures before using the system for real campus entry decisions.

Do not use local seed accounts or the development database for production gate control.