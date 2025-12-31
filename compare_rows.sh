#!/bin/bash
SOURCE_URL="postgresql://postgres:m1dland1ab201@db.qabouyfjaxumdcflktpm.supabase.co:5432/postgres"
TARGET_URL="postgresql://postgres:m1dland1ab201@db.arfxjujlckeiplhhogvl.supabase.co:5432/postgres"

echo "Table | Source | Target | Diff"
echo "------------------------------"

QUERY="SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
TABLES=$(psql "$SOURCE_URL" -tAc "$QUERY")

TOTAL_SOURCE=0
TOTAL_TARGET=0

for table in $TABLES; do
    COUNT_S=$(psql "$SOURCE_URL" -tAc "SELECT count(*) FROM \"public\".\"$table\"")
    COUNT_T=$(psql "$TARGET_URL" -tAc "SELECT count(*) FROM \"public\".\"$table\"")
    DIFF=$((COUNT_S - COUNT_T))
    
    TOTAL_SOURCE=$((TOTAL_SOURCE + COUNT_S))
    TOTAL_TARGET=$((TOTAL_TARGET + COUNT_T))
    
    if [ $DIFF -ne 0 ]; then
        echo "$table | $COUNT_S | $COUNT_T | $DIFF"
    else
        echo "$table | $COUNT_S | $COUNT_T | 0"
    fi
done

echo "------------------------------"
echo "TOTAL | $TOTAL_SOURCE | $TOTAL_TARGET | $((TOTAL_SOURCE - TOTAL_TARGET))"
