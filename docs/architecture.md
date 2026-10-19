# High-Level Service Architecture — WPITRDA Mail Management System

```mermaid
flowchart LR
    User(["Users<br/>(Peon, HOD, Officer, Authority)"])

    subgraph Edge["Identity & Edge Gateway"]
        Gateway["Sites / ChatGPT Identity Gateway<br/>(SSO & Header Injection)"]
    end

    subgraph App["Cloudflare Worker Runtime (Vinext / Next.js)"]
        WebUI["Web Dashboard Service<br/>(SSR Role Guards & React UI)"]
        AuthSvc["Authentication & Session Service<br/>(PBKDF2 Auth, Rate Limiting, RBAC)"]
        MailSvc["Correspondence & Workflow Service<br/>(Registration, Routing, Handover, Audit)"]
        ScanSvc["Document Scan Service<br/>(File Validation & Sandboxed Streaming)"]
    end

    subgraph Storage["Cloudflare Managed Storage"]
        D1[("Cloudflare D1 Database<br/>(SQLite: State, Sessions, Audit)")]
        R2[("Cloudflare R2 Storage<br/>(Object Store: PDF/Image Scans)")]
        Secrets["Worker Secret Store<br/>(WPITRDA_ACCOUNT_CREDENTIALS)"]
    end

    User -->|"HTTPS"| Gateway
    Gateway -->|"Authenticated Requests"| WebUI
    
    WebUI -->|"Sign-in / Session Check"| AuthSvc
    WebUI -->|"Letter & Account Actions"| MailSvc
    WebUI -->|"Upload / View Scans"| ScanSvc

    MailSvc -->|"Verify Role & Actor"| AuthSvc
    ScanSvc -->|"Verify Role & Actor"| AuthSvc

    AuthSvc -->|"Verify Hashes"| Secrets
    AuthSvc -->|"Sessions & Throttling"| D1
    MailSvc -->|"Read/Write Workspace State"| D1
    ScanSvc -->|"Store/Fetch Attachments"| R2
    ScanSvc -->|"Log Scan Metadata & Views"| D1
```

## Core Services Summary

1. **Sites / ChatGPT Identity Gateway**: Outer edge proxy that authenticates the workspace user and injects verified identity headers (`oai-authenticated-user-*`).
2. **Web Dashboard Service**: Serves the 4 role-isolated interfaces (`/peon`, `/hod`, `/officer`, `/authority`) with server-side route protection.
3. **Authentication & Session Service**: Validates inner role credentials against **Worker Secrets** (`PBKDF2-SHA256`), enforces login rate-limiting, and manages 8-hour sessions in **D1**.
4. **Correspondence & Workflow Service**: Handles letter registration, office routing, HOD delegation, officer assignment, physical handover tracking, and append-only audit logging with optimistic locking in **D1**.
5. **Document Scan Service**: Validates file headers (`PDF`, `JPEG`, `PNG`), stores binary scans in **R2**, and streams them back with sandboxed security headers.
6. **Cloudflare D1 & R2**: Managed serverless SQLite database (`DB`) and S3-compatible object storage (`BUCKET`).
