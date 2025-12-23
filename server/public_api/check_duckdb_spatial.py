import duckdb
con = duckdb.connect()
con.execute("LOAD spatial;")
print(con.execute("SELECT * FROM duckdb_functions() WHERE function_name ILIKE '%mvt%';").fetchdf())
