#!/bin/bash
SOURCE_URL="postgresql://postgres:m1dland1ab201@db.qabouyfjaxumdcflktpm.supabase.co:5432/postgres"
TARGET_URL="postgresql://postgres:m1dland1ab201@db.arfxjujlckeiplhhogvl.supabase.co:5432/postgres"

echo "Table Name | Source Count | Target Count | Difference"
echo "-----------|--------------|--------------|------------"

# Get list of tables from information_schema
TABLES=$(psql "$SOURCE_URL" -tAc "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name")

TOTAL_S=0
TOTAL_T=0

for table in $TABLES; do
    S=$(psql "$SOURCE_URL" -tAc "SELECT COUNT(*) FROM \"public\".\"$table\"")
    T=$(psql "$TARGET_URL" -tAc "SELECT COUNT(*) FROM \"public\".\"$table\"")
    
    TOTAL_S=$((TOTAL_S + S))
    TOTAL_T=$((TOTAL_T + T))
    
    if [ "$S" -ne "$T" ]; then
        echo "** $table | $S | $T | $((S - T)) **"
    else
        echo "$table | $S | $T | 0"
    fi
done

echo "-----------|--------------|--------------|------------"
echo "TOTAL | $TOTAL_S | $TOTAL_T | $((TOTAL_S - TOTAL_T))"
