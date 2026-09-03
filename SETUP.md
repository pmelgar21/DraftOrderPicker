# Running it on Unraid with DuckDNS

About 45 minutes end to end. You need port **443** forwarded; port 80 is not required
because the certificate is issued over DNS.

**Check this first.** In the UniFi console look at your WAN IP, then compare it with
whatismyip.com. If they differ your ISP has you behind CGNAT, port forwarding cannot work,
and you should use a Cloudflare Tunnel instead — say the word and I'll rewrite these steps.

---

## 1. DuckDNS

1. Sign in at [duckdns.org](https://www.duckdns.org) with GitHub or Google.
2. Create a subdomain, e.g. `melgardraft` → gives you `melgardraft.duckdns.org`.
3. Copy the **token** at the top of the page.

## 2. Keep the IP updated

Unraid → **Apps** → search **duckdns** (linuxserver.io) → Install.

| Setting | Value |
|---|---|
| SUBDOMAINS | `melgardraft` |
| TOKEN | your DuckDNS token |

## 3. PocketBase

Unraid → **Apps** → search **pocketbase**. If no template appeals, add a container manually:

| Setting | Value |
|---|---|
| Repository | `ghcr.io/muchobien/pocketbase:latest` |
| Network | `bridge` |
| Port | `8090` → `8090` |
| Path | `/mnt/user/appdata/pocketbase/pb_data` → `/pb_data` |
| Path | `/mnt/user/appdata/pocketbase/pb_hooks` → `/pb_hooks` |
| Path | `/mnt/user/appdata/pocketbase/pb_public` → `/pb_public` |

Then copy this repo's files onto the server:

```
pb_hooks/lib.js        ->  /mnt/user/appdata/pocketbase/pb_hooks/lib.js
pb_hooks/main.pb.js    ->  /mnt/user/appdata/pocketbase/pb_hooks/main.pb.js
pb_public/index.html   ->  /mnt/user/appdata/pocketbase/pb_public/index.html
```

Start the container, then from any machine on your LAN check:

```bash
curl http://TOWER-IP:8090/api/dop/health
```

You want `{"ok":true,"hasDraft":false,...}`. If you get a 404 the hooks did not load — check
the container log and the `pb_hooks` mount.

**Set the superuser password now.** Open `http://TOWER-IP:8090/_/` and create the account
before anything is exposed to the internet.

## 4. Certificate and reverse proxy

Unraid → **Apps** → **Nginx Proxy Manager** → Install (skip if you already run NPM or SWAG).
Open its UI on port 81, default login `admin@example.com` / `changeme`, and change it
immediately.

**SSL Certificates → Add → Let's Encrypt**
- Domain: `melgardraft.duckdns.org`
- Enable **Use a DNS Challenge**, provider **DuckDNS**, credentials `dns_duckdns_token=YOUR_TOKEN`
- Agree to the terms, Save. This is why you don't need port 80 open.

**Hosts → Proxy Hosts → Add**
- Domain: `melgardraft.duckdns.org`
- Forward to `TOWER-IP` port `8090`, scheme `http`
- **Websockets Support: on**
- SSL tab: pick the certificate, turn on **Force SSL** and **HTTP/2**

In the **Advanced** tab, keep the admin UI off the public internet:

```nginx
location /_/ {
    return 404;
}
```

You can still reach the dashboard on your LAN at `http://TOWER-IP:8090/_/`.

## 5. Forward the port

UniFi → **Settings → Routing & Firewall → Port Forwarding**:

| | |
|---|---|
| Port | `443` |
| Forward IP | your Nginx Proxy Manager host |
| Forward Port | `443` |

Test from your **phone on cellular, not wifi** — that is the only test that proves it works
from outside:

```
https://melgardraft.duckdns.org/api/dop/health
```

## 6. Run the draft

1. Open `https://melgardraft.duckdns.org/` — you get the setup screen.
2. Enter the 12 owner names in picking order and hit **Shuffle deck and start**.
   **Do this immediately.** The first person to hit that page creates the draft, and after
   that it is locked to your host token.
3. **Bookmark the host link.** It contains your host token and is the only way back to the
   board. It is under *Host link and starting over*.
4. **Copy all 12 links** and send each owner theirs. That is the last thing you have to do.
5. Optionally post the commit hash to the group chat, and the plain
   `https://melgardraft.duckdns.org/` address — that's a safe read-only board anyone can watch.

Owners pick whenever they like. Your board updates itself. Nobody sends you anything.

---

## Notes

**Security.** You are opening a port to the internet. The admin UI is blocked at the proxy,
the superuser password is yours, and the app's own endpoints only expose what a given token is
entitled to. Take the port forward back down after Saturday.

**Backups.** Everything lives in `/mnt/user/appdata/pocketbase/pb_data/dop_state.json`. It is a
few kilobytes. Copy it somewhere once the draft is under way, and the whole thing is
recoverable by copying it back.

**If the server is down** when an owner opens their link, they see an error and can retry
later — nothing is lost. But the draft cannot progress while it is offline, so keep the box up
Thursday through Saturday.

**Fallback.** `index.html` in the repo root is the older self-contained version that needs no
server at all. It works entirely offline in one browser, at the cost of passing codes around by
text. It is there in case Saturday arrives and this setup isn't ready.
