# criterionnow-notifier

Sends a push notification when the film changes on the [Criterion Channel 24/7 stream](https://whatsonnow.criterionchannel.com/). Runs every 2 minutes via GitHub Actions.

## Subscribing

Notifications are sent via [ntfy.sh](https://ntfy.sh) to the topic configured in the `NTFY_TOPIC` repo variable.

### ntfy app (iOS / Android)

1. Install [ntfy](https://ntfy.sh/#subscribe)
2. Add a subscription for the topic (e.g. `criterionnow-notifier-d0r@l1l1`)

### Web

Visit `https://ntfy.sh/<topic>` in a browser and allow notifications.

### curl

```sh
curl -s https://ntfy.sh/<topic>/json
```
