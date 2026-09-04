# Running it on Unraid with DuckDNS

Deployed and working. This is the route that actually worked, with the traps that cost time
called out — the earlier version of this guide walked into several of them.

**Check this first.** Compare your UniFi WAN IP with whatismyip.com. If they differ your ISP has
you behind CGNAT, port forwarding cannot work, and you need a Cloudflare Tunnel instead.

---

## 1. DuckDNS

1. Sign in at [duckdns.org](https://www.duckdns.org) with GitHub or Google.
2. Create a subdomain, e.g. `melgardraft` → `melgardraft.duckdns.org`.
3. Copy the **token**.

## 2. Keep the IP updated

Unraid → **Apps** → **duckdns** (linuxserver.io) → Install. Set `SUBDOMAINS` to your subdomain
and `TOKEN` to your token.

## 3. PocketBase

> **Version matters.** Needs PocketBase **v0.23+** — the JS hook API was rewritten in 0.23 and
> hooks silently fail to load on anything older. Some Unraid templates pin ancient versions
> (`spectado/pocketbase:0.19.2`). Tested against **0.40.2**.
>
> **Two mounts and a port people get wrong.** Templates often omit `/pb_hooks` entirely, and
> may map the host port to container port **80** — PocketBase listens on **8090**. Either
> mistake gives you a server that starts fine and 404s every route.

| Setting | Value |
|---|---|
| Repository | `ghcr.io/muchobien/pocketbase:latest` |
| Network Type | **Bridge** |
| Port | Host `8090` → **Container `8090`** |
| Path | `/mnt/user/appdata/pocketbase/pb_data` → `/pb_data` |
| Path | `/mnt/user/appdata/pocketbase/pb_hooks` → `/pb_hooks` |
| Path | `/mnt/user/appdata/pocketbase/pb_public` → `/pb_public` |

**Leave it on Bridge.** Putting it on `br0` breaks it: macvlan containers cannot talk to their
own host, so the reverse proxy can't reach it.

Verify the container took all three mounts and the right port:

```bash
docker inspect pocketbase --format '{{.Config.Image}} {{range .Mounts}}[{{.Destination}}] {{end}}'
docker ps --filter name=pocketbase --format '{{.Ports}}'
```

You want `->8090/tcp`, not `->80/tcp`.

Load the app files from the Unraid **Terminal** (`>_`, top right):

```bash
mkdir -p /mnt/user/appdata/pocketbase/pb_hooks /mnt/user/appdata/pocketbase/pb_public
cd /mnt/user/appdata/pocketbase
B=https://raw.githubusercontent.com/pmelgar21/DraftOrderPicker/main
curl -fsSL -o pb_hooks/lib.js      $B/pb_hooks/lib.js
curl -fsSL -o pb_hooks/main.pb.js  $B/pb_hooks/main.pb.js
curl -fsSL -o pb_public/index.html $B/pb_public/index.html
ls -l pb_hooks pb_public
```

Roughly 6 KB, 7.5 KB, 24 KB. **Restart the container afterwards** — hooks register only at
startup. (`pb_public` is read per request, so page edits need no restart, only a browser
hard-refresh.)

Check from another machine on the LAN:

```bash
curl http://TOWER-IP:8090/api/dop/health
```

`{"ok":true,...}` with a `statePath` starting `/pb_hooks/../pb_data/` means everything loaded.
A PocketBase-shaped `{"code":404,"message":"Not Found."}` means the server is healthy but the
hooks did not register: check the `/pb_hooks` mount, the version, and that you restarted.

**Set the superuser password** before anything is exposed:

```bash
docker exec pocketbase /usr/local/bin/pocketbase superuser upsert you@example.com 'a-long-password' --dir /pb_data
```

`--dir /pb_data` is required. Without it the command edits a database nothing is using and still
reports success. If the dashboard shows a **login** form rather than a create-account form, an
account already exists — `upsert` resets it either way.

## 4. Certificate and reverse proxy

Unraid → **Apps** → **Nginx Proxy Manager Official**.

> **Unraid holds ports 80 and 443 on the host.** Its web GUI has 80, and its nginx binds
> `127.0.0.1:443`. Docker cannot bind `0.0.0.0:443` over that, so a plain `443:443` mapping
> fails with "address already in use" even though nothing external answers there. Use a
> different host port and let the router translate.

| Setting | Value |
|---|---|
| Network Type | **Bridge** (not br0 — same macvlan problem) |
| WebUI | Host `81` → Container `81` |
| HTTPS Port | Host **`4443`** → Container `443` |
| HTTP Port | **remove the row** — not needed with a DNS challenge |
| Data | `/mnt/user/appdata/Nginx-Proxy-Manager-Official/data` → `/data` |
| Certificates | `/mnt/user/appdata/Nginx-Proxy-Manager-Official/letsencrypt` → `/etc/letsencrypt` |

Those two appdata paths hold the certificate and all config, so the container can be deleted and
re-added freely without losing anything.

Open `http://TOWER-IP:81`, log in with `admin@example.com` / `changeme`, change both immediately.

### The certificate

**Certificates → Add Certificate** — this is a **dropdown**. Pick **Let's Encrypt via DNS**, not
via HTTP. Older guides describe a "Use a DNS Challenge" toggle inside the dialog; newer builds
moved that choice into the menu instead.

- Domain Names: `melgardraft.duckdns.org` — the **full** hostname, typed then **Enter** to make
  a chip. Just `melgardraft` will fail. A pasted `https://…` URL is rejected by the field's
  validation pattern.
- DNS Provider: **DuckDNS**
- Credentials: `dns_duckdns_token=YOUR_TOKEN` — one line, replacing the placeholder text
- Propagation Seconds: **120** (blank uses a default that is often too short)
- Save. **Never press Test** — it checks HTTP reachability on port 80, which you deliberately
  aren't using, and it fails no matter how correct your setup is.

> **Let's Encrypt allows only 5 failed validations per hostname per hour.** Each wrong attempt
> burns one. Confirm the right challenge was used:
> ```bash
> docker logs Nginx-Proxy-Manager-Official --tail 20 2>&1 | grep -i "command:"
> ```
> `--authenticator dns-duckdns` is right. `--authenticator webroot` means it used HTTP-01 and
> will keep failing until you switch to the DNS variant.

### The proxy host

**Hosts → Proxy Hosts → Add Proxy Host**

- Domain Names: `melgardraft.duckdns.org`
- Scheme `http`, Forward Hostname / IP **`172.17.0.1`**, Forward Port **`8090`**
- Websockets Support: **ON**

`172.17.0.1` is the Docker bridge gateway — the host as seen from inside a container. It is
stable regardless of LAN addressing.

**SSL tab:** select the certificate, **Force SSL** on, **HTTP/2** on.

**Custom Nginx Configuration** (the gear icon — older builds called this the Advanced tab):

```nginx
location /_/ {
    return 404;
}
```

That keeps the PocketBase dashboard off the public internet. The LAN route
`http://TOWER-IP:8090/_/` still works.

Verify locally before opening any ports:

```bash
curl -sk --resolve melgardraft.duckdns.org:4443:TOWER-IP https://melgardraft.duckdns.org:4443/api/dop/health
curl -sk --resolve melgardraft.duckdns.org:4443:TOWER-IP -o /dev/null -w "%{http_code}\n" https://melgardraft.duckdns.org:4443/_/
```

`{"ok":true,...}` then `404`.

## 5. Forward the port

UniFi → **Settings → Security → Port Forwarding** (older versions: *Routing & Firewall*):

| Field | Value |
|---|---|
| Name | `DraftPicker` |
| Port (external) | `443` |
| Forward IP | `TOWER-IP` |
| Forward Port | **`4443`** |
| Protocol | TCP |

External and internal ports differ deliberately — see the port note in step 4. Owners still use
a plain `https://` URL with no port.

**Test from a phone on cellular, wifi off.** From inside the LAN you will likely hit your
gateway instead and get a misleading result.

Forward **only** 443. Unraid's web GUI is on port 80 and must never be exposed.

## 6. Run the draft

1. Open `https://melgardraft.duckdns.org/` — the setup screen.
2. Enter the 12 owner names in picking order → **Shuffle deck and start**.
   **Do this immediately.** The first visitor to that page creates the draft; afterwards it is
   locked to your host token.
3. **Bookmark the host link** (under *Host link and starting over*). It is the only way back.
4. **Copy all 12 links**, send each owner theirs. That is the last thing you have to do.
5. Optionally post the commit hash, and the bare `https://melgardraft.duckdns.org/` address as a
   read-only board anyone can watch.

Owners pick whenever they like. Your board updates itself. Nobody sends you anything.

---

## Notes

**Practice first, then reset.** Run a full practice draft, then **Start over** before the real
one. To wipe it from the terminal instead:
`rm -f /mnt/user/appdata/pocketbase/pb_data/dop_state.json`

**Backups.** The entire draft is `/mnt/user/appdata/pocketbase/pb_data/dop_state.json`, a few
kilobytes. Copy it somewhere once picks start; restoring is copying it back.

**Keep the box up** Thursday to Saturday. If it's down an owner sees an error and can retry —
nothing is lost — but the draft cannot progress.

**Take the port forward down afterwards.**

**If something breaks,** check the obvious thing first: is the PocketBase container actually
running? A stopped container looks exactly like a networking failure from every direction.

**Fallback.** `index.html` in the repo root is a self-contained version needing no server at
all, deployed at <https://pmelgar21.github.io/DraftOrderPicker/>. It trades away free selection
and live updates for working entirely offline in one browser.
