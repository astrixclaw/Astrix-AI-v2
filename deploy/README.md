# Astrix Home — Deployment

This folder holds the production deployment artefacts for the backend.

## What's installed on the hub

```
/etc/systemd/system/astrix-home.service     <- managed by systemd
/etc/logrotate.d/astrix-home                <- daily log rotation
/var/log/astrix-home/backend.log            <- combined stdout+stderr
```

The systemd unit:

- Runs `node /home/astrix/.openclaw/workspace/Astrix-Home/backend/dist/server.js`
  as the `astrix` user, on port 18800, in production mode.
- Auto-restarts on failure (`Restart=on-failure`, `RestartSec=3`,
  burst-capped at 10 restarts per 60 seconds).
- Memory-capped at 512 MB and 128 tasks — generous compared to the ~55 MB
  the backend actually uses.
- Lightly hardened: `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`,
  `ProtectHome=read-only`, with the working dir + log dir explicitly
  whitelisted via `ReadWritePaths`.
- Auto-starts on boot (`WantedBy=multi-user.target`).

## Useful commands

```bash
# Status
sudo systemctl status astrix-home

# Tail the live log
sudo tail -f /var/log/astrix-home/backend.log

# Or the journal version
sudo journalctl -u astrix-home -f

# Restart after a deploy
cd ~/.openclaw/workspace/Astrix-Home/backend
npm run build
sudo systemctl restart astrix-home

# Stop / disable
sudo systemctl stop astrix-home
sudo systemctl disable astrix-home
```

## Deploy workflow

1. `git pull` (or local edits) in `Astrix-Home/backend`
2. `npm install` if dependencies changed
3. `npm run build`
4. `sudo systemctl restart astrix-home`
5. `curl http://127.0.0.1:18800/api/health` to verify

## (Re)installing the unit

If `astrix-home.service` changes, copy it back into place and reload:

```bash
sudo install -m 644 deploy/astrix-home.service /etc/systemd/system/astrix-home.service
sudo install -m 644 deploy/astrix-home.logrotate /etc/logrotate.d/astrix-home
sudo systemctl daemon-reload
sudo systemctl restart astrix-home
```
