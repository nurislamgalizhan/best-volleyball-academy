DO 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bva_app') THEN
    CREATE ROLE bva_app LOGIN PASSWORD 'BestVolleyballAcademy123!';
  ELSE
    ALTER ROLE bva_app WITH LOGIN PASSWORD 'BestVolleyballAcademy123!';
  END IF;
END
;
SELECT 'CREATE DATABASE best_volleyball_academy OWNER bva_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'best_volleyball_academy')\gexec
GRANT ALL PRIVILEGES ON DATABASE best_volleyball_academy TO bva_app;
