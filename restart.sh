SC="C:/Users/rlin7/AppData/Local/Temp/claude/4b1c7420942e1b01/a0839159-3e14-45d4-af01-900ab9d0c624/scratchpad"
pid=$(netstat -ano | grep ":3109 " | grep LISTEN | awk '{print $5}' | head -1); [ -n "$pid" ] && taskkill //PID $pid //F //T >/dev/null
(PORT=3109 CLIENT_ORIGIN=http://127.0.0.1:5189 S3_AUTODETECT=0 SEED_DEV_ACCOUNT=0 UPLOAD_DIR=/tmp/vtt-up npm run start > $SC/srv.txt 2>&1 &)
for i in $(seq 1 40); do curl -s -o /dev/null http://127.0.0.1:3109/health && break; sleep 2; done
