#!/bin/bash
curl -s -o /dev/null \
  "https://antqewvlzfonsakgndxt.supabase.co/rest/v1/proposals?select=id&limit=1" \
  -H "apikey: sb_publishable__37RI5zv54AI023pjvFdbA_AUkoAme2" \
  -H "Authorization: Bearer sb_publishable__37RI5zv54AI023pjvFdbA_AUkoAme2"
echo "$(date): Supabase ping OK" >> /tmp/supabase-keepalive.log
