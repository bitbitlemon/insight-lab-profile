#!/bin/bash
# 后端健康看门狗: /api/health 10s 内无响应或非 200 即重启服务
if ! curl -sf -m 10 http://127.0.0.1:8080/api/health > /dev/null; then
  echo "$(date -Is) health check failed, restarting insight-lab-backend" >> /root/insight-lab-profile/backups/watchdog.log
  systemctl restart insight-lab-backend.service
fi
