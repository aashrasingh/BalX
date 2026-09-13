#!/bin/bash
set -e
cd /home/claude/balx

echo "=== starting server ==="
node src/index.js > /tmp/server.log 2>&1 &
SERVER_PID=$!
sleep 1.5
cat /tmp/server.log
echo ""

fail=0
check() {
  local label="$1" expect="$2" got="$3"
  if [[ "$got" == *"$expect"* ]]; then
    echo "OK   $label"
  else
    echo "FAIL $label -- expected to contain: $expect"
    echo "     got: $got"
    fail=1
  fi
}

echo "=== health ==="
HEALTH=$(curl -s http://localhost:5000/api/health)
check "health" '"success":true' "$HEALTH"

echo ""
echo "=== parent login (Prakriti (Parent), workprakriti11@gmail.com) ==="
REQ_OTP=$(curl -s -X POST http://localhost:5000/api/auth/request-otp -H "Content-Type: application/json" -d '{"identifier":"workprakriti11@gmail.com"}')
echo "$REQ_OTP"
PARENT_CODE=$(echo "$REQ_OTP" | python3 -c "import json,sys; print(json.load(sys.stdin)['demoCode'])")
PARENT_LOGIN=$(curl -s -X POST http://localhost:5000/api/auth/verify-otp -H "Content-Type: application/json" -d "{\"identifier\":\"workprakriti11@gmail.com\",\"code\":\"$PARENT_CODE\"}")
echo "$PARENT_LOGIN"
PARENT_TOKEN=$(echo "$PARENT_LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
echo "parent token acquired: ${PARENT_TOKEN:0:20}..."

echo ""
echo "=== parent: children ==="
CHILDREN=$(curl -s http://localhost:5000/api/parent/children -H "Authorization: Bearer $PARENT_TOKEN")
echo "$CHILDREN"
check "children list" '"student_id":"STU001"' "$CHILDREN"

echo ""
echo "=== parent: overview for STU001 (owned) ==="
OVERVIEW=$(curl -s http://localhost:5000/api/parent/students/STU001/overview -H "Authorization: Bearer $PARENT_TOKEN")
echo "$OVERVIEW"
check "overview has modules" '"modules":[' "$OVERVIEW"
check "overview has clearance" '"clearance":[' "$OVERVIEW"

echo ""
echo "=== parent: overview for STU005 (NOT owned by this parent) should 403 ==="
FORBIDDEN=$(curl -s -w " HTTPSTATUS:%{http_code}" http://localhost:5000/api/parent/students/STU005/overview -H "Authorization: Bearer $PARENT_TOKEN")
echo "$FORBIDDEN"
check "cross-family blocked" "HTTPSTATUS:403" "$FORBIDDEN"

echo ""
echo "=== parent: attendance rows for STU001 ==="
ATT=$(curl -s http://localhost:5000/api/parent/students/STU001/attendance -H "Authorization: Bearer $PARENT_TOKEN")
check "attendance rows returned" '"moduleName"' "$ATT"

echo ""
echo "=== parent: create a ticket for STU001 ==="
NEWTICKET=$(curl -s -X POST http://localhost:5000/api/parent/tickets -H "Authorization: Bearer $PARENT_TOKEN" -H "Content-Type: application/json" -d '{"studentId":"STU001","category":"Attendance concern","message":"Testing ticket creation","priority":"standard"}')
echo "$NEWTICKET"
check "ticket created" '"status":"open"' "$NEWTICKET"
NEWTICKET_ID=$(echo "$NEWTICKET" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")

echo ""
echo "=== parent: tickets list for STU001 ==="
TICKETS=$(curl -s http://localhost:5000/api/parent/students/STU001/tickets -H "Authorization: Bearer $PARENT_TOKEN")
check "tickets list includes new one" 'Testing ticket creation' "$TICKETS"

echo ""
echo "=== login via EMAIL instead of phone (main login portal uses this) ==="
echo ""
echo "=== login via EMAIL for a second parent (aashrasingh282@gmail.com) - confirms multiple real accounts work ==="
REQ_OTP2=$(curl -s -X POST http://localhost:5000/api/auth/request-otp -H "Content-Type: application/json" -d '{"identifier":"aashrasingh282@gmail.com"}')
CODE2=$(echo "$REQ_OTP2" | python3 -c "import json,sys; print(json.load(sys.stdin)['demoCode'])")
EMAIL_LOGIN=$(curl -s -X POST http://localhost:5000/api/auth/verify-otp -H "Content-Type: application/json" -d "{\"identifier\":\"aashrasingh282@gmail.com\",\"code\":\"$CODE2\"}")
check "second parent email login works" '"role":"parent"' "$EMAIL_LOGIN"

echo ""
echo "=== staff login (Student Services, studentservice444@gmail.com) ==="
REQ_STAFF_OTP=$(curl -s -X POST http://localhost:5000/api/auth/request-otp -H "Content-Type: application/json" -d '{"identifier":"studentservice444@gmail.com"}')
STAFF_CODE=$(echo "$REQ_STAFF_OTP" | python3 -c "import json,sys; print(json.load(sys.stdin)['demoCode'])")
STAFF_LOGIN=$(curl -s -X POST http://localhost:5000/api/auth/verify-otp -H "Content-Type: application/json" -d "{\"identifier\":\"studentservice444@gmail.com\",\"code\":\"$STAFF_CODE\"}")
STAFF_TOKEN=$(echo "$STAFF_LOGIN" | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
echo "staff token acquired: ${STAFF_TOKEN:0:20}..."

echo ""
echo "=== staff: parent-only route should 403 for staff ==="
STAFFTRYPARENT=$(curl -s -w " HTTPSTATUS:%{http_code}" http://localhost:5000/api/parent/children -H "Authorization: Bearer $STAFF_TOKEN")
check "role separation enforced" "HTTPSTATUS:403" "$STAFFTRYPARENT"

echo ""
echo "=== staff: all students with risk ==="
STUDENTS=$(curl -s http://localhost:5000/api/staff/students -H "Authorization: Bearer $STAFF_TOKEN")
check "students list has worstRiskLevel" 'worstRiskLevel' "$STUDENTS"

echo ""
echo "=== staff: search students by name ==="
SEARCH=$(curl -s "http://localhost:5000/api/staff/students/search?name=sijan" -H "Authorization: Bearer $STAFF_TOKEN")
echo "$SEARCH"
check "search finds Sijan Thapa" "Sijan Thapa" "$SEARCH"

echo ""
echo "=== staff: attendance lookup for STU005 (Sijan, our at-risk student) ==="
STU005ATT=$(curl -s http://localhost:5000/api/staff/students/STU005/attendance -H "Authorization: Bearer $STAFF_TOKEN")
check "STU005 attendance rows present" '"moduleName"' "$STU005ATT"

echo ""
echo "=== staff: flagged attendance summary (amber/red) ==="
FLAGGED=$(curl -s http://localhost:5000/api/staff/attendance-summary -H "Authorization: Bearer $STAFF_TOKEN")
echo "$FLAGGED"
check "flagged summary returns rows" 'studentName' "$FLAGGED"

echo ""
echo "=== staff: manual sync trigger ==="
SYNC=$(curl -s -X POST http://localhost:5000/api/staff/sync-attendance -H "Authorization: Bearer $STAFF_TOKEN")
echo "$SYNC"
check "sync responds with success" '"success":true' "$SYNC"

echo ""
echo "=== staff: all tickets ==="
ALLTICKETS=$(curl -s http://localhost:5000/api/staff/tickets -H "Authorization: Bearer $STAFF_TOKEN")
check "tickets include our new test ticket" 'Testing ticket creation' "$ALLTICKETS"

echo ""
echo "=== staff: update a ticket status ==="
UPDATED=$(curl -s -X PATCH http://localhost:5000/api/staff/tickets/$NEWTICKET_ID -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" -d '{"status":"resolved","assignedTo":"D. Cole"}')
echo "$UPDATED"
check "ticket updated" '"status":"resolved"' "$UPDATED"

echo ""
echo "=== staff: reply to a ticket (auto-moves open -> in_progress) ==="
REPLY_TICKET=$(curl -s -X POST http://localhost:5000/api/parent/tickets -H "Authorization: Bearer $PARENT_TOKEN" -H "Content-Type: application/json" -d '{"studentId":"STU001","category":"Test","message":"reply test"}')
REPLY_TICKET_ID=$(echo "$REPLY_TICKET" | python3 -c "import json,sys; print(json.load(sys.stdin)['data']['id'])")
REPLIED=$(curl -s -X PATCH http://localhost:5000/api/staff/tickets/$REPLY_TICKET_ID -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" -d '{"reply":"We are looking into this."}')
echo "$REPLIED"
check "reply is saved" '"staff_reply":"We are looking into this."' "$REPLIED"
check "replying auto-moves status to in_progress" '"status":"in_progress"' "$REPLIED"

echo ""
echo "=== staff: compose an urgent notice (broadcast) ==="
NOTICE=$(curl -s -X POST http://localhost:5000/api/staff/notices -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" -d '{"title":"Test urgent notice","body":"This is a test.","isUrgent":true}')
echo "$NOTICE"
check "notice created" '"is_urgent":true' "$NOTICE"

echo ""
echo "=== parent: confirm broadcast notice now shows up for STU001 ==="
NOTICES_AFTER=$(curl -s http://localhost:5000/api/parent/students/STU001/overview -H "Authorization: Bearer $PARENT_TOKEN")
check "broadcast notice reaches parent portal" "Test urgent notice" "$NOTICES_AFTER"

echo ""
echo "=== static file serving ==="
STATIC=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/index.html)
check "index.html (login gate) served" "200" "$STATIC"
STATIC1B=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/)
check "/ serves the login gate" "200" "$STATIC1B"
STATIC2=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/parent.html)
check "parent.html served" "200" "$STATIC2"
STATIC3=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/staff.html)
check "staff.html served" "200" "$STATIC3"

kill $SERVER_PID 2>/dev/null
echo ""
if [[ $fail -eq 0 ]]; then
  echo "===== ALL CHECKS PASSED ====="
else
  echo "===== SOME CHECKS FAILED ====="
fi
exit $fail
