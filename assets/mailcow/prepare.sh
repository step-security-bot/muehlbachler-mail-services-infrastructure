#!/bin/sh

### mailcow ###
# create directories
mkdir -p /opt/backup/mailcow || true

# clone mailcow
git clone https://github.com/mailcow/mailcow-dockerized /opt/mailcow || true
