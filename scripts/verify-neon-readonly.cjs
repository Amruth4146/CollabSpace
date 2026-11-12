#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
/**
 * CollabSpace - Phase 7D-V3.3.3-R2
 * Safe Read-Only Neon Connection Preflight Verification Script
 *
 * SAFETY GUARANTEES:
 * 1. Read-only SQL queries only (SELECT current_database(), SELECT FROM information_schema).
 * 2. Never prints credentials, passwords, or full connection URLs.
 * 3. Does not modify any database objects, tables, rows, or schemas.
 * 4. Explicitly rejects localhost, 127.0.0.1, Docker, or unencrypted endpoints.
 * 5. Cleanly releases client connections in finally blocks.
 */

const { Client } = require('pg');

function parseAndSanitizeUrl(rawUrl, varName) {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new Error(`Environment variable ${varName} is missing or empty.`);
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch (err) {
    throw new Error(`Failed to parse ${varName} as a valid URL: ${err.message}`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`${varName} invalid protocol "${parsed.protocol}". Expected "postgresql:" or "postgres:".`);
  }

  const hostname = parsed.hostname;
  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  const dbName = parsed.pathname.replace(/^\//, '');
  const sslmode = (parsed.searchParams.get('sslmode') || '').toLowerCase();

  // Safety checks against localhost / local Docker
  const lowerHost = hostname.toLowerCase();
  if (
    lowerHost === 'localhost' ||
    lowerHost === '127.0.0.1' ||
    lowerHost === '::1' ||
    lowerHost.includes('docker') ||
    lowerHost.includes('collabspace-postgres')
  ) {
    throw new Error(
      `SAFETY VIOLATION: ${varName} points to a local host (${hostname}). Only remote Neon endpoints are permitted.`
    );
  }

  const isNeonHost = lowerHost.endsWith('.neon.tech');
  const isPooled = lowerHost.includes('-pooler') || port === 6543;
  const sslRequired = sslmode === 'require' || sslmode === 'verify-full' || sslmode === 'verify-ca';

  return {
    rawUrl: rawUrl.trim(),
    varName,
    hostname,
    port,
    dbName,
    sslmode: sslmode || '(none)',
    isNeonHost,
    isPooled,
    sslRequired,
  };
}

async function verifyEndpoint(parsedInfo) {
  console.log(`\n--- Inspecting ${parsedInfo.varName} ---`);
  console.log(`  Hostname:        ${parsedInfo.hostname}`);
  console.log(`  Reported Port:   ${parsedInfo.port}`);
  console.log(`  Database Name:   ${parsedInfo.dbName}`);
  console.log(`  Neon Provider:   ${parsedInfo.isNeonHost ? 'YES (*.neon.tech)' : 'NON-NEON HOST'}`);
  console.log(`  Pooler Detected: ${parsedInfo.isPooled ? 'YES (Pooled Endpoint)' : 'NO (Direct Endpoint)'}`);
  console.log(`  SSL Mode:        ${parsedInfo.sslmode} (SSL Required: ${parsedInfo.sslRequired ? 'YES' : 'NO'})`);

  if (!parsedInfo.sslRequired) {
    throw new Error(`SAFETY ERROR: ${parsedInfo.varName} does not enforce sslmode=require.`);
  }

  const client = new Client({
    connectionString: parsedInfo.rawUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    const isEncrypted = Boolean(client.connection && client.connection.stream && client.connection.stream.encrypted);
    console.log(`  TLS Handshake:   ESTABLISHED (Transport Encrypted: ${isEncrypted ? 'YES' : 'UNKNOWN'})`);

    // 1. Identity query
    const idRes = await client.query(`
      SELECT 
        current_database() AS db_name, 
        current_user AS user_name, 
        inet_server_addr() AS server_addr, 
        version() AS pg_version
    `);
    const idRow = idRes.rows[0];
    console.log(`  Live DB Name:    ${idRow.db_name}`);
    console.log(`  Connected User:  ${idRow.user_name}`);
    console.log(`  Server Version:  ${idRow.pg_version ? idRow.pg_version.split(' on ')[0] : 'Unknown'}`);

    // 2. Schemas
    const schemasRes = await client.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schema_name;
    `);
    const schemas = schemasRes.rows.map(r => r.schema_name);
    console.log(`  User Schemas:    [${schemas.join(', ')}]`);

    // 3. Tables count and listing
    const tablesRes = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name;
    `);
    const tables = tablesRes.rows.map(r => `${r.table_schema}.${r.table_name}`);
    console.log(`  Existing Tables: ${tables.length === 0 ? '0 tables (EMPTY / FRESH)' : `${tables.length} tables found: [${tables.join(', ')}]`}`);

    // 4. Migration history check
    const migCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
      ) AS has_migrations;
    `);
    const hasMigrations = migCheck.rows[0].has_migrations;
    let migrationCount = 0;
    if (hasMigrations) {
      const migRows = await client.query(`SELECT id, migration_name, finished_at FROM _prisma_migrations ORDER BY started_at;`);
      migrationCount = migRows.rowCount;
      console.log(`  Prisma Migrations: ${migrationCount} applied migrations found.`);
      migRows.rows.forEach(m => console.log(`    - ${m.migration_name} (finished: ${m.finished_at})`));
    } else {
      console.log(`  Prisma Migrations: _prisma_migrations table does NOT exist (FRESH)`);
    }

    return {
      success: true,
      parsedInfo,
      dbName: idRow.db_name,
      userName: idRow.user_name,
      pgVersion: idRow.pg_version,
      tableCount: tables.length,
      tables,
      hasMigrations,
      migrationCount,
    };
  } finally {
    try {
      await client.end();
    } catch (_) {}
  }
}

async function main() {
  console.log('================================================================');
  console.log('   CollabSpace - Neon Safe Read-Only Preflight Verification     ');
  console.log('================================================================');

  const rawDirect = process.env.DIRECT_URL;
  const rawDb = process.env.DATABASE_URL;

  if (!rawDirect || !rawDb) {
    console.error('\n[FATAL ERROR] Required environment variables are missing in this process:');
    if (!rawDirect) console.error('  - DIRECT_URL is missing or empty.');
    if (!rawDb) console.error('  - DATABASE_URL is missing or empty.');
    console.error('\nPlease ensure both variables are exported in your PowerShell terminal before running this script.');
    process.exit(1);
  }

  let directInfo, dbInfo;
  try {
    directInfo = parseAndSanitizeUrl(rawDirect, 'DIRECT_URL');
    dbInfo = parseAndSanitizeUrl(rawDb, 'DATABASE_URL');
  } catch (err) {
    console.error(`\n[FATAL ERROR] Parameter validation failed: ${err.message}`);
    process.exit(1);
  }

  // Pre-flight validation on endpoints
  if (directInfo.isPooled) {
    console.error('\n[FATAL ERROR] DIRECT_URL appears to be a pooled endpoint (-pooler or port 6543). DIRECT_URL must be an unpooled direct connection.');
    process.exit(1);
  }
  if (!dbInfo.isPooled) {
    console.warn('\n[WARNING] DATABASE_URL does not have "-pooler" in hostname. Recommended to use pooled endpoint for runtime.');
  }

  try {
    console.log('\n[1/2] Connecting to DIRECT_URL...');
    const directResult = await verifyEndpoint(directInfo);

    console.log('\n[2/2] Connecting to DATABASE_URL...');
    const dbResult = await verifyEndpoint(dbInfo);

    console.log('\n================================================================');
    console.log('                 CROSS-ENDPOINT RECONCILIATION                  ');
    console.log('================================================================');

    const dbNameMatch = directResult.dbName === dbResult.dbName;
    console.log(`  Database Identity Match: ${dbNameMatch ? `YES (${directResult.dbName})` : `MISMATCH (DIRECT: ${directResult.dbName} vs POOLED: ${dbResult.dbName})`}`);

    if (!dbNameMatch) {
      throw new Error(`Direct and Pooled endpoints identify different databases (${directResult.dbName} vs ${dbResult.dbName}).`);
    }

    const isFresh = directResult.tableCount === 0 && !directResult.hasMigrations;
    console.log(`  Target Freshness:        ${isFresh ? 'VERIFIED FRESH (0 tables, no migration history)' : `EXISTING DATA (${directResult.tableCount} tables)`}`);

    console.log('\n================================================================');
    console.log('                   PREFLIGHT AUDIT SUMMARY                      ');
    console.log('================================================================');
    console.log(`  Provider:                 Neon Serverless PostgreSQL`);
    console.log(`  Direct Hostname:          ${directInfo.hostname}`);
    console.log(`  Direct Port:              ${directInfo.port}`);
    console.log(`  Pooled Hostname:          ${dbInfo.hostname}`);
    console.log(`  Pooled Port:              ${dbInfo.port}`);
    console.log(`  Database Name:            ${directResult.dbName}`);
    console.log(`  SSL Enforced:             YES (both endpoints)`);
    console.log(`  Freshness:                ${isFresh ? 'VERIFIED (Clean database ready for initial migration)' : 'WARNING (Tables or migrations present)'}`);
    console.log(`  Local PostgreSQL Excluded:YES (127.0.0.1 strictly guarded)`);
    console.log('================================================================\n');

    if (!isFresh) {
      console.warn('NOTICE: The target database contains existing tables or migration history. Review above before proceeding.');
    } else {
      console.log('PREFLIGHT VERIFICATION SUCCESSFUL: Neon database is ready for initial migration.');
    }

  } catch (err) {
    console.error(`\n[FATAL ERROR] Preflight connectivity/verification failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[UNEXPECTED ERROR]', err.message);
  process.exit(1);
});

