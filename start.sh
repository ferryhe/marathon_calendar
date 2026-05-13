#!/bin/bash
cd /opt/marathon_calendar
exec /root/.nvm/versions/node/v22.22.1/bin/node node_modules/.bin/tsx server/index.ts
