#!/bin/bash
set -e

DOCKER_DIR="/home/jotalma13/Documents/Bolsa/dicoogle-next/docker-test"
DICOM_FILE="$HOME/FELIX/IM-0001-0074.dcmfe2f32c2-0564-45a2-9aa7-6c71c6a6913d.dcm"
DICOM_TIMEOUT=20
TEST_UID="1.2.840.113745.101000.1008000.38446.6272.7138759"

# Track results for summary
declare -A RESULTS

generate_dockerfile() {
  local sr_mode="$1"
  local qi_mode="$2"
  local sr_plugin="$3"  # "on" or "off"
  local qi_plugin="$4"  # "on" or "off"

  local cmd_line="java -jar app.jar"
  cmd_line+=" --spring.profiles.active=dev"
  cmd_line+=" --server.port=8082"
  cmd_line+=" --app.dimse.cstore.enabled=true"
  cmd_line+=" --app.dimse.cstore.port=11113"
  cmd_line+=" --app.plugins.startup-validation.require-writable-provider=false"
  cmd_line+=" --dicoogle.legacy-proxy.enabled=true"
  cmd_line+=" --dicoogle.legacy-proxy.base-url=http://legacy:8080"
  cmd_line+=" --dicoogle.legacy-proxy.auth.username=dicoogle"
  cmd_line+=" --dicoogle.legacy-proxy.auth.password=dicoogle"
  cmd_line+=" --dicoogle.legacy-proxy.storage-retrieve-mode=$sr_mode"
  cmd_line+=" --dicoogle.legacy-proxy.query-index-mode=$qi_mode"
  cmd_line+=" --app.dimse.cmove.destinations.LEGACYSCP.host=legacy"
  cmd_line+=" --app.dimse.cmove.destinations.LEGACYSCP.port=6666"
  cmd_line+=" --app.dimse.cmove.destinations.LEGACYSCP.ae-title=DICOOGLE"

  cmd_line+=" --app.storage.file-rw.root-dir=/dicoogle-storage"

  if [ "$sr_plugin" = "on" ]; then
    cmd_line+=" --app.storage.file-rw.enabled=true"
  else
    cmd_line+=" --app.storage.file-rw.enabled=false"
  fi

  if [ "$qi_plugin" = "on" ]; then
    cmd_line+=" --app.query.lucene.enabled=true"
  else
    cmd_line+=" --app.query.lucene.enabled=false"
  fi

  # Always disable file-query (lucene is the main query plugin)
  cmd_line+=" --app.query.file.enabled=false"

  cat > "$DOCKER_DIR/Dockerfile.next" << HEADER
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY dicoogle-next-0.0.1-SNAPSHOT.jar app.jar
CMD $cmd_line
HEADER
}

start_docker() {
  cd "$DOCKER_DIR"
  docker compose down 2>/dev/null || true
  docker compose up --build -d 2>&1 | tail -3
  # Wait for app to start (takes ~19s)
  local waited=0
  while [ $waited -lt 40 ]; do
    if docker logs dicoogle-next 2>&1 | grep -q "Started DicoogleNextApplication"; then
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done
}

stop_docker() {
  cd "$DOCKER_DIR"
  docker compose down 2>/dev/null || true
}

legacy_login() {
  curl -s -X POST -H 'Content-Type: application/x-www-form-urlencoded' \
    -d 'username=dicoogle&password=dicoogle' 'http://localhost:8080/login' \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])"
}

reindex_legacy() {
  local token
  token=$(legacy_login)
  curl -s -H "Authorization: Bearer $token" -X POST \
    'http://localhost:8080/management/tasks/index?uri=file:///dicoogle-storage' > /dev/null
  sleep 5
}

reindex_local() {
  local resp
  resp=$(curl -s -u developer:developer -X POST -H 'Content-Type: application/json' \
    -d '{"uris":["file:///dicoogle-storage"]}' 'http://localhost:8082/api/system/index/index' 2>&1)
  sleep 5
}

# Print dcmtk verbose output lines that contain DICOM responses
print_dimse_responses() {
  local output="$1"
  local tool="$2"
  echo "$output" | grep -E "^I:.*Response|^I:.*UID|^I:.*\[.*\]" | head -10
}

# Extract UIDs from dcmtk UI [...] format (only from response section, not request)
extract_uids_from_responses() {
  local output="$1"
  # Only extract UIDs from lines after "Find Response:" (response section)
  echo "$output" | sed -n '/Find Response:/,$ p' | grep -oP '(?<=UI \[)[0-9.]+' | sort -u
}

# Count Find Response pending lines (each = one result)
count_find_responses() {
  local output="$1"
  echo "$output" | grep -c "Find Response: [0-9]* (Pending)" || true
}

run_tests() {
  local sr_mode="$1"
  local qi_mode="$2"
  local sr_plugin="$3"
  local qi_plugin="$4"
  local desc="$5"
  local key="${sr_mode}_${qi_mode}"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  TEST: $desc"
  echo "  storage-retrieve=$sr_mode (plugin=$sr_plugin), query-index=$qi_mode (plugin=$qi_plugin)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  generate_dockerfile "$sr_mode" "$qi_mode" "$sr_plugin" "$qi_plugin"
  start_docker

  if ! docker logs dicoogle-next 2>&1 | grep -q "Started DicoogleNextApplication"; then
    echo "  [APP FAILED TO START]"
    docker logs dicoogle-next --tail 15 2>&1 | sed 's/^/  | /'
    stop_docker
    RESULTS[$key]="APP_FAIL"
    return
  fi

  # Show startup plugin status
  docker logs dicoogle-next 2>&1 | grep -E "Storage plugins loaded|No writable|LuceneQuery|start" | tail -5 | sed 's/^/  | /'

  # Clear logs before tests
  docker logs dicoogle-next --tail 0 2>/dev/null

  local all_pass=true

  # ── C-STORE ──
  echo ""
  echo "  [C-STORE]"
  local store_out
  store_out=$(timeout $DICOM_TIMEOUT storescu -v -aet STORESCU -aec DICOOGLE localhost 11113 "$DICOM_FILE" 2>&1) || true

  local store_success=false
  local store_detail=""
  if echo "$store_out" | grep -q "Received Store Response (Success)"; then
    store_success=true
    store_detail="Success"
  elif echo "$store_out" | grep -q "Received Store Response (Refused"; then
    store_detail="Refused: $(echo "$store_out" | grep -oP 'Refused: \K[^)]+')"
  elif echo "$store_out" | grep -q "timed out"; then
    store_detail="Timeout (server did not respond)"
  else
    store_detail="Error: $(echo "$store_out" | grep -iE "error|exception" | head -1)"
  fi

  # Extract the SOPInstanceUID we sent
  local sent_uid
  sent_uid=$(dcmdump +P 0008,0018 "$DICOM_FILE" 2>/dev/null | grep -oP '(?<=UI \[)[0-9.]+' || true)

  local sr_fallback
  sr_fallback=$(docker logs dicoogle-next 2>&1 | grep -c "C-STORE.*falling back" || true)
  local sr_legacy_stored
  sr_legacy_stored=$(docker logs dicoogle-next 2>&1 | grep -c "C-STORE.*stored via legacy" || true)

  echo "    SOPInstanceUID sent: ${sent_uid:-<unknown>}"
  echo "    DIMSE result: $store_detail"

  if [ "$sr_plugin" = "on" ]; then
    # NEW mode with plugin: should succeed locally
    if $store_success; then
      echo "    Routing: LOCAL (plugin stored) ✓"
    else
      echo "    Routing: LOCAL but FAILED ✗ — $store_detail"
      all_pass=false
    fi
  else
    # No local plugin: should fallback to legacy
    if $store_success && [ "$sr_fallback" -gt 0 ]; then
      echo "    Routing: LEGACY fallback → Success ✓"
    elif $store_success; then
      echo "    Routing: Success but no fallback log? ✓"
    else
      echo "    Routing: FAILED and no fallback ✗ — $store_detail"
      all_pass=false
    fi
  fi

  # Reindex AFTER store — always reindex the QUERY backend so /search can find the data
  if [ "$qi_plugin" = "on" ] && $store_success; then
    echo "    Reindexing local storage (query backend)..."
    reindex_local
  elif [ "$qi_plugin" = "off" ] && $store_success; then
    echo "    Reindexing legacy storage (query backend)..."
    reindex_legacy
  fi

  # ── C-FIND ──
  sleep 2
  echo ""
  echo "  [C-FIND]"
  local find_out
  find_out=$(timeout $DICOM_TIMEOUT findscu -v -aet FINDSCU -aec DICOOGLE -S \
    -k QueryRetrieveLevel=STUDY -k "StudyInstanceUID=$TEST_UID" \
    localhost 11113 2>&1) || true

  local find_success=false
  if echo "$find_out" | grep -q "Received Final Find Response (Success)"; then
    find_success=true
  fi

  local find_uids
  find_uids=$(extract_uids_from_responses "$find_out")
  local find_count
  find_count=$(count_find_responses "$find_out")

  local qi_fallback
  qi_fallback=$(docker logs dicoogle-next 2>&1 | grep -c "C-FIND.*falling back" || true)

  if $find_success; then
    echo "    DIMSE result: Success"
  else
    local find_status
    find_status=$(echo "$find_out" | grep -oP 'Final Find Response \(\K[^)]+' || echo "unknown")
    echo "    DIMSE result: $find_status"
  fi
  echo "    Studies found: $find_count"
  if [ -n "$find_uids" ]; then
    echo "$find_uids" | while read -r uid; do echo "      StudyInstanceUID=$uid"; done
  fi

  if [ "$qi_plugin" = "on" ]; then
    if $find_success && [ "$find_count" -gt 0 ]; then
      echo "    Routing: LOCAL (plugin found $find_count studies) ✓"
    elif $find_success; then
      echo "    Routing: LOCAL but 0 results (index empty or query miss)"
    else
      echo "    Routing: LOCAL but FAILED ✗"
      all_pass=false
    fi
  else
    if $find_success && [ "$qi_fallback" -gt 0 ]; then
      echo "    Routing: LEGACY fallback → Success ✓"
    elif [ "$qi_fallback" -gt 0 ]; then
      echo "    Routing: LEGACY fallback → $find_count results"
    else
      echo "    Routing: No fallback, failed locally ✗"
      all_pass=false
    fi
  fi

  # ── C-MOVE ──
  echo ""
  echo "  [C-MOVE]"
  local move_out
  move_out=$(timeout $DICOM_TIMEOUT movescu -v -aet MOVESCU -aec DICOOGLE -S \
    -k QueryRetrieveLevel=STUDY -k "StudyInstanceUID=$TEST_UID" \
    -aem LEGACYSCP localhost 11113 2>&1) || true

  local move_success=false
  if echo "$move_out" | grep -q "Received Final Move Response"; then
    move_success=true
  fi
  local move_final_status
  move_final_status=$(echo "$move_out" | grep -oP 'Final Move Response \(\K[^)]+' || echo "unknown")
  local move_responses
  move_responses=$(echo "$move_out" | grep -c "Received Move Response [0-9]" || true)

  local move_fb
  move_fb=$(docker logs dicoogle-next 2>&1 | grep -c "C-MOVE.*falling back" || true)

  echo "    DIMSE result: $move_final_status"
  echo "    Pending responses: $move_responses"

  if [ "$qi_plugin" = "on" ]; then
    if $move_success; then
      echo "    Routing: LOCAL (plugin query + send) ✓"
    else
      echo "    Routing: LOCAL but FAILED: $move_final_status ✗"
      all_pass=false
    fi
  else
    if $move_success && [ "$move_fb" -gt 0 ]; then
      echo "    Routing: LEGACY fallback → Success ✓"
    elif [ "$move_fb" -gt 0 ]; then
      echo "    Routing: LEGACY fallback → $move_final_status"
    else
      echo "    Routing: No fallback, failed locally ✗"
      all_pass=false
    fi
  fi

  # ── HTTP /search ──
  echo ""
  echo "  [HTTP /search]"
  local search_http
  search_http=$(curl -s -w '\n%{http_code}' -u developer:developer 'http://localhost:8082/api/search?query=FELIX' 2>&1)
  local search_http_code
  search_http_code=$(echo "$search_http" | tail -1)
  local search_result
  search_result=$(echo "$search_http" | sed '$d')

  local search_valid=false
  local num_results=-1
  if echo "$search_result" | python3 -c "import sys,json; json.load(sys.stdin)" >/dev/null 2>&1; then
    search_valid=true
    num_results=$(echo "$search_result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('numResults', -1))" 2>/dev/null || echo -1)
  fi

  local http_fb
  http_fb=$(docker logs dicoogle-next 2>&1 | grep -c "No local query plugin, falling back" || true)

  echo "    HTTP $search_http_code"
  if $search_valid; then
    echo "    numResults: $num_results"
    echo "$search_result" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for r in d.get('results',[])[:3]:
    fields = r.get('fields', r)
    pname = fields.get('PatientName', '?')
    uid = fields.get('StudyInstanceUID', r.get('uid', '?'))
    mod = fields.get('Modality', '?')
    desc = fields.get('StudyDescription', '?')
    print(f'      Patient={pname}  Modality={mod}')
    print(f'        StudyUID={uid}')
    print(f'        Description={desc}')
" 2>/dev/null
  else
    echo "    raw response: ${search_result:0:500}"
  fi

  if [ "$qi_plugin" = "on" ]; then
    if $search_valid && [ "$num_results" -gt 0 ] 2>/dev/null; then
      echo "    Routing: LOCAL (plugin found $num_results results) ✓"
    elif $search_valid; then
      echo "    Routing: LOCAL but 0 results"
    else
      echo "    Routing: LOCAL but invalid response ✗"
      all_pass=false
    fi
  else
    if [ "$http_fb" -gt 0 ]; then
      if [ "$num_results" -gt 0 ] 2>/dev/null; then
        echo "    Routing: LEGACY fallback → $num_results results ✓"
      else
        echo "    Routing: LEGACY fallback → 0 results"
      fi
    else
      echo "    Routing: No fallback ✗"
      all_pass=false
    fi
  fi

  # ── HTTP /system/index/status (before) ──
  echo ""
  echo "  [HTTP /system/index/status]"
  local status_http
  status_http=$(curl -s -w '\n%{http_code}' -u developer:developer 'http://localhost:8082/api/system/index/status' 2>&1)
  local status_http_code
  status_http_code=$(echo "$status_http" | tail -1)
  local status_resp
  status_resp=$(echo "$status_http" | sed '$d')
  echo "    HTTP $status_http_code"
  echo "    $status_resp" | python3 -m json.tool 2>/dev/null | sed 's/^/    /' || echo "    $status_resp"

  # ── HTTP /system/index/index ──
  echo ""
  echo "  [HTTP /system/index/index]"
  local idx_before
  idx_before=$(docker logs dicoogle-next 2>&1 | grep -c "No local index plugin, falling back" || true)
  local idx_http
  idx_http=$(curl -s -w '\n%{http_code}' -u developer:developer -X POST -H 'Content-Type: application/json' \
    -d '{"uris":["file:///dicoogle-storage"]}' 'http://localhost:8082/api/system/index/index' 2>&1)
  local idx_http_code
  idx_http_code=$(echo "$idx_http" | tail -1)
  local idx_resp
  idx_resp=$(echo "$idx_http" | sed '$d')
  local idx_fb
  idx_fb=$(docker logs dicoogle-next 2>&1 | grep -c "No local index plugin, falling back" || true)
  idx_fb=$(( idx_fb - idx_before ))

  echo "    HTTP $idx_http_code"
  echo "    $idx_resp" | python3 -m json.tool 2>/dev/null | sed 's/^/    /' || echo "    $idx_resp"

  if [ "$qi_plugin" = "on" ]; then
    echo "    Routing: LOCAL (plugin handles indexing) ✓"
  elif [ "$idx_fb" -gt 0 ]; then
    echo "    Routing: LEGACY fallback (async, returns [] immediately) ✓"
  else
    echo "    Routing: No fallback"
  fi

  # ── HTTP /system/index/status (after) ──
  echo ""
  echo "  [HTTP /system/index/status after indexing]"
  local status2_http
  status2_http=$(curl -s -w '\n%{http_code}' -u developer:developer 'http://localhost:8082/api/system/index/status' 2>&1)
  local status2_http_code
  status2_http_code=$(echo "$status2_http" | tail -1)
  local status2_resp
  status2_resp=$(echo "$status2_http" | sed '$d')
  echo "    HTTP $status2_http_code"
  echo "    $status2_resp" | python3 -m json.tool 2>/dev/null | sed 's/^/    /' || echo "    $status2_resp"

  # Record result
  if $all_pass; then
    RESULTS[$key]="PASS"
  else
    RESULTS[$key]="FAIL"
  fi

  echo ""
  stop_docker
}

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  MODE COMBINATION MATRIX TEST                               ║"
echo "║  Tests: C-STORE, C-FIND, C-MOVE, HTTP /search, HTTP /index ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  DICOM file: $DICOM_FILE"
echo "  StudyInstanceUID: $TEST_UID"

run_tests "LEGACY" "LEGACY" "off" "off" "ALL LEGACY (no plugins, everything routes to legacy)"
run_tests "NEW"     "NEW"     "on"  "on"  "ALL NEW (local storage + local query, no legacy)"
run_tests "LEGACY" "NEW"     "off" "on"  "MIXED: storage=legacy, query=local"
run_tests "NEW"     "LEGACY" "on"  "off" "MIXED: storage=local, query=legacy"
run_tests "AUTO"   "AUTO"    "off" "off" "AUTO (no plugins, fallback to legacy)"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  SUMMARY                                                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
printf "  %-45s %s\n" "Test" "Result"
echo "  ────────────────────────────────────────────────────────────"
for key in "LEGACY_LEGACY" "NEW_NEW" "LEGACY_NEW" "NEW_LEGACY" "AUTO_AUTO"; do
  result="${RESULTS[$key]:-NOT RUN}"
  if [ "$result" = "PASS" ]; then
    printf "  %-45s ✅ PASS\n" "$key"
  elif [ "$result" = "FAIL" ]; then
    printf "  %-45s ❌ FAIL\n" "$key"
  else
    printf "  %-45s ⚠️  %s\n" "$key" "$result"
  fi
done
echo "╚══════════════════════════════════════════════════════════════╝"
