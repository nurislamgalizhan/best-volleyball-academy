DO 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mercury_medet_app') THEN
    CREATE ROLE mercury_medet_app LOGIN PASSWORD 'MercuryMedet123!';
  ELSE
    ALTER ROLE mercury_medet_app WITH LOGIN PASSWORD 'MercuryMedet123!';
  END IF;
END
;
SELECT 'CREATE DATABASE mercury_medet OWNER mercury_medet_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mercury_medet')\gexec
GRANT ALL PRIVILEGES ON DATABASE mercury_medet TO mercury_medet_app;
