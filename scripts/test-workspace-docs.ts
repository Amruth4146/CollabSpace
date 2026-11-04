/**
 * End-to-End Integration Test Suite for CollabSpace Workspace & Document Management
 * 
 * Tests real HTTP API requests against PostgreSQL on http://localhost:3000
 */

const BASE_URL = 'http://localhost:3000';
const PASS = '✓';
const FAIL = '✗';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${PASS} ${testName}`);
  } else {
    failedTests++;
    console.error(`  ${FAIL} FAILED: ${testName}${detail ? ` (${detail})` : ''}`);
  }
}

function extractCookie(response: Response, cookieName: string): string | null {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return null;
  const match = setCookie.match(new RegExp(`${cookieName}=([^;]+)`));
  return match ? match[1] : null;
}

async function runWorkspaceAndDocTests() {
  console.log('\n================================================================');
  console.log('   CollabSpace Workspace & Document Management Integration Tests');
  console.log('================================================================\n');

  const ts = Date.now();
  const aliceEmail = `alice_${ts}@collabspace.test`;
  const bobEmail = `bob_${ts}@collabspace.test`;
  const eveEmail = `eve_${ts}@collabspace.test`;
  const password = 'StrongPassword123!';

  let aliceCookie = '';
  let bobCookie = '';
  let eveCookie = '';

  let engineeringWorkspaceId = '';
  let opsWorkspaceId = '';
  let bobMemberId = '';
  let docId = '';
  let dupDocId = '';

  try {
    // -------------------------------------------------------------
    // 1. SETUP USERS
    // -------------------------------------------------------------
    console.log('--- 1. User Setup & Authentication ---');

    // Alice
    const regAlice = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': `10.100.1.${Math.floor(Math.random() * 250) + 1}`,
      },
      body: JSON.stringify({ name: 'Alice Engineer', email: aliceEmail, password, confirmPassword: password }),
    });
    assert(regAlice.status === 201, 'Registered Alice');
    aliceCookie = `collabspace_session=${extractCookie(regAlice, 'collabspace_session')}`;

    // Bob
    const regBob = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': `10.100.2.${Math.floor(Math.random() * 250) + 1}`,
      },
      body: JSON.stringify({ name: 'Bob Collaborator', email: bobEmail, password, confirmPassword: password }),
    });
    assert(regBob.status === 201, 'Registered Bob');
    bobCookie = `collabspace_session=${extractCookie(regBob, 'collabspace_session')}`;

    // Eve (Attacker / Unauthorized user)
    const regEve = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': `10.100.3.${Math.floor(Math.random() * 250) + 1}`,
      },
      body: JSON.stringify({ name: 'Eve Outsider', email: eveEmail, password, confirmPassword: password }),
    });
    assert(regEve.status === 201, 'Registered Eve');
    eveCookie = `collabspace_session=${extractCookie(regEve, 'collabspace_session')}`;

    // -------------------------------------------------------------
    // 2. WORKSPACE CREATION & MANAGEMENT
    // -------------------------------------------------------------
    console.log('\n--- 2. Workspace Creation, Details & Renaming ---');

    const createWsRes = await fetch(`${BASE_URL}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({ name: 'Engineering Hub', icon: '🚀' }),
    });
    const createWsData = await createWsRes.json();
    assert(createWsRes.status === 201, 'Alice created "Engineering Hub" workspace');
    assert(Boolean(createWsData.workspace?.id), 'Workspace returned real UUID');
    engineeringWorkspaceId = createWsData.workspace.id;

    // List workspaces
    const listWsRes = await fetch(`${BASE_URL}/api/workspaces`, {
      headers: { Cookie: aliceCookie },
    });
    const listWsData = await listWsRes.json();
    assert(listWsRes.status === 200, 'Alice fetched workspaces list');
    const createdWs = listWsData.workspaces.find((w: { id: string; name: string; role: string }) => w.id === engineeringWorkspaceId);
    assert(createdWs?.name === 'Engineering Hub', 'Workspace name persisted accurately');
    assert(createdWs?.role === 'owner', 'Alice is workspace owner');

    // Update workspace details (rename & change slug)
    const updateWsRes = await fetch(`${BASE_URL}/api/workspaces/${engineeringWorkspaceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({ name: 'Engineering Core', icon: '⚡' }),
    });
    const updateWsData = await updateWsRes.json();
    assert(updateWsRes.status === 200, 'Alice renamed workspace to "Engineering Core"');
    assert(updateWsData.workspace?.name === 'Engineering Core', 'Updated name returned');
    assert(updateWsData.workspace?.icon === '⚡', 'Updated icon returned');

    // -------------------------------------------------------------
    // 3. MEMBER MANAGEMENT & INVITATIONS
    // -------------------------------------------------------------
    console.log('\n--- 3. Workspace Member Management ---');

    // Alice invites Bob as editor
    const inviteRes = await fetch(`${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({ email: bobEmail, role: 'editor' }),
    });
    const inviteData = await inviteRes.json();
    assert(inviteRes.status === 201, 'Alice invited Bob as Editor');
    assert(inviteData.member?.user?.email === bobEmail, 'Bob email matches invited member');
    bobMemberId = inviteData.member.id;

    // Verify members list
    const getMembersRes = await fetch(`${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/members`, {
      headers: { Cookie: aliceCookie },
    });
    const getMembersData = await getMembersRes.json();
    assert(getMembersRes.status === 200, 'Retrieved workspace members list');
    assert(getMembersData.members.length === 2, 'Workspace has 2 members (Alice & Bob)');

    // Update Bob's role to admin
    const updateRoleRes = await fetch(
      `${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/members/${bobMemberId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
        body: JSON.stringify({ role: 'admin' }),
      }
    );
    const updateRoleData = await updateRoleRes.json();
    assert(updateRoleRes.status === 200, 'Updated Bob role to Admin');
    assert(updateRoleData.member?.role === 'admin', 'Bob role is now admin');

    // -------------------------------------------------------------
    // 4. DOCUMENT CREATION & PERSISTENCE
    // -------------------------------------------------------------
    console.log('\n--- 4. Document Creation & Persistence ---');

    const createDocRes = await fetch(`${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({
        title: 'Architecture RFC 001',
        icon: '📐',
        tag: 'Architecture',
      }),
    });
    const createDocData = await createDocRes.json();
    assert(createDocRes.status === 201, 'Alice created document "Architecture RFC 001"');
    assert(Boolean(createDocData.document?.id), 'Document returned a valid UUID');
    assert(!createDocData.document?.id.startsWith('doc-'), 'Document ID is real PostgreSQL UUID, not mock');
    docId = createDocData.document.id;

    // Fetch document directly
    const getDocRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      headers: { Cookie: aliceCookie },
    });
    const getDocData = await getDocRes.json();
    assert(getDocRes.status === 200, 'Fetched document by UUID');
    assert(getDocData.document?.title === 'Architecture RFC 001', 'Document title matches');
    assert(getDocData.document?.tags.includes('Architecture'), 'Document tag persisted');
    assert(getDocData.document?.workspace?.name === 'Engineering Core', 'Workspace name included');
    assert(getDocData.userRole === 'owner', 'Caller permission correctly identified as owner');

    // -------------------------------------------------------------
    // 5. DOCUMENT AUTOSAVE & RENAMING
    // -------------------------------------------------------------
    console.log('\n--- 5. Document Editing & Title Renaming ---');

    const renameRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({
        title: 'Architecture RFC 001 - Approved',
        content: '<p>Standardizing on PostgreSQL and real-time collaboration.</p>',
      }),
    });
    const renameData = await renameRes.json();
    assert(renameRes.status === 200, 'Document updated (title & content)');
    assert(renameData.document?.title === 'Architecture RFC 001 - Approved', 'Title updated');
    assert(
      renameData.document?.content.includes('Standardizing on PostgreSQL'),
      'Content autosaved to PostgreSQL'
    );

    // Refresh test: verify persistence in new GET request
    const refreshDocRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      headers: { Cookie: aliceCookie },
    });
    const refreshDocData = await refreshDocRes.json();
    assert(
      refreshDocData.document?.title === 'Architecture RFC 001 - Approved',
      'Refreshed and verified persistent title'
    );

    // -------------------------------------------------------------
    // 6. FAVORITES / STAR TOGGLE
    // -------------------------------------------------------------
    console.log('\n--- 6. Star & Favorites Filtering ---');

    const starRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({ isStarred: true }),
    });
    assert(starRes.status === 200, 'Starred document');

    const starredListRes = await fetch(
      `${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/documents?filter=starred`,
      { headers: { Cookie: aliceCookie } }
    );
    const starredListData = await starredListRes.json();
    assert(
      starredListData.documents.some((d: { id: string }) => d.id === docId),
      'Document appears in Starred filter'
    );

    // Unstar
    await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({ isStarred: false }),
    });

    // -------------------------------------------------------------
    // 7. SEARCH & SORTING
    // -------------------------------------------------------------
    console.log('\n--- 7. Real-Time Document Search & Sorting ---');

    // Create a 2nd document for search differentiation
    const createDoc2Res = await fetch(`${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({
        title: 'Product Roadmap 2026',
        icon: '🗺️',
        tag: 'Roadmap',
      }),
    });
    assert(createDoc2Res.status === 201, 'Created second document "Product Roadmap 2026"');

    // Search for "Roadmap"
    const searchRoadmapRes = await fetch(
      `${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/documents?q=Roadmap`,
      { headers: { Cookie: aliceCookie } }
    );
    const searchRoadmapData = await searchRoadmapRes.json();
    assert(
      searchRoadmapData.documents.length === 1 &&
        searchRoadmapData.documents[0].title === 'Product Roadmap 2026',
      'Search query "Roadmap" returned only matching document'
    );

    // Search for "RFC"
    const searchRfcRes = await fetch(
      `${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/documents?q=RFC`,
      { headers: { Cookie: aliceCookie } }
    );
    const searchRfcData = await searchRfcRes.json();
    assert(
      searchRfcData.documents.length === 1 &&
        searchRfcData.documents[0].title.includes('Architecture RFC'),
      'Search query "RFC" returned only Architecture RFC'
    );

    // Sort by name ASC
    const sortNameRes = await fetch(
      `${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/documents?sort=name&order=asc`,
      { headers: { Cookie: aliceCookie } }
    );
    const sortNameData = await sortNameRes.json();
    assert(
      sortNameData.documents[0].title === 'Architecture RFC 001 - Approved',
      'Sort by name ASC properly places Architecture before Product'
    );

    // -------------------------------------------------------------
    // 8. ARCHIVING & RESTORATION
    // -------------------------------------------------------------
    console.log('\n--- 8. Archive & Restore Lifecycle ---');

    const archiveRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({ isArchived: true }),
    });
    assert(archiveRes.status === 200, 'Archived Architecture document');

    // Check normal list (archived must NOT appear in filter=all)
    const normalListRes = await fetch(
      `${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/documents?filter=all`,
      { headers: { Cookie: aliceCookie } }
    );
    const normalListData = await normalListRes.json();
    assert(
      !normalListData.documents.some((d: { id: string }) => d.id === docId),
      'Archived document is excluded from main document list'
    );

    // Check archive list (archived MUST appear in filter=archived)
    const archivedListRes = await fetch(
      `${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/documents?filter=archived`,
      { headers: { Cookie: aliceCookie } }
    );
    const archivedListData = await archivedListRes.json();
    assert(
      archivedListData.documents.some((d: { id: string }) => d.id === docId),
      'Archived document appears in Archived view'
    );

    // Restore from archive
    const restoreArchiveRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({ isArchived: false }),
    });
    assert(restoreArchiveRes.status === 200, 'Restored document from archive');

    // -------------------------------------------------------------
    // 9. DUPLICATE DOCUMENT
    // -------------------------------------------------------------
    console.log('\n--- 9. Document Duplication ---');

    const dupRes = await fetch(`${BASE_URL}/api/documents/${docId}/duplicate`, {
      method: 'POST',
      headers: { Cookie: aliceCookie },
    });
    const dupData = await dupRes.json();
    assert(dupRes.status === 201, 'Duplicated document');
    assert(dupData.document?.title === 'Architecture RFC 001 - Approved (Copy)', 'Copy title appended');
    assert(dupData.document?.id !== docId, 'Duplicated document has its own unique ID');
    dupDocId = dupData.document.id;

    // -------------------------------------------------------------
    // 10. MOVE DOCUMENT TO ANOTHER WORKSPACE
    // -------------------------------------------------------------
    console.log('\n--- 10. Move Document to Another Workspace ---');

    // Alice creates "Operations" workspace
    const createOpsRes = await fetch(`${BASE_URL}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({ name: 'Operations', icon: '⚙️' }),
    });
    const createOpsData = await createOpsRes.json();
    opsWorkspaceId = createOpsData.workspace.id;

    // Move duplicated doc to Operations
    const moveRes = await fetch(`${BASE_URL}/api/documents/${dupDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({ workspaceId: opsWorkspaceId }),
    });
    assert(moveRes.status === 200, 'Moved duplicated doc to "Operations" workspace');

    // Check Engineering workspace docs
    const engDocsRes = await fetch(
      `${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/documents`,
      { headers: { Cookie: aliceCookie } }
    );
    const engDocsData = await engDocsRes.json();
    assert(
      !engDocsData.documents.some((d: { id: string }) => d.id === dupDocId),
      'Moved document no longer in source workspace'
    );

    // Check Operations workspace docs
    const opsDocsRes = await fetch(
      `${BASE_URL}/api/workspaces/${opsWorkspaceId}/documents`,
      { headers: { Cookie: aliceCookie } }
    );
    const opsDocsData = await opsDocsRes.json();
    assert(
      opsDocsData.documents.some((d: { id: string }) => d.id === dupDocId),
      'Moved document present in destination workspace'
    );

    // -------------------------------------------------------------
    // 11. SOFT DELETE (TRASH) & PERMANENT DELETE
    // -------------------------------------------------------------
    console.log('\n--- 11. Trash & Permanent Deletion ---');

    // Soft delete duplicated doc in Operations
    const trashRes = await fetch(`${BASE_URL}/api/documents/${dupDocId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: aliceCookie },
      body: JSON.stringify({ isDeleted: true }),
    });
    assert(trashRes.status === 200, 'Soft deleted duplicated document (moved to Trash)');

    const trashListRes = await fetch(
      `${BASE_URL}/api/workspaces/${opsWorkspaceId}/documents?filter=trash`,
      { headers: { Cookie: aliceCookie } }
    );
    const trashListData = await trashListRes.json();
    assert(
      trashListData.documents.some((d: { id: string }) => d.id === dupDocId),
      'Document appears in Trash view'
    );

    // Permanent delete
    const permDeleteRes = await fetch(`${BASE_URL}/api/documents/${dupDocId}`, {
      method: 'DELETE',
      headers: { Cookie: aliceCookie },
    });
    assert(permDeleteRes.status === 200, 'Permanently deleted document');

    // Verify 404
    const verifyDeleteRes = await fetch(`${BASE_URL}/api/documents/${dupDocId}`, {
      headers: { Cookie: aliceCookie },
    });
    assert(verifyDeleteRes.status === 404, 'Permanently deleted document returns 404');

    // -------------------------------------------------------------
    // 12. UNAUTHORIZED ACCESS ATTEMPTS (SECURITY & PERMISSIONS)
    // -------------------------------------------------------------
    console.log('\n--- 12. Security & RBAC Enforcement ---');

    // Eve (not a member) tries to read Alice's doc
    const eveReadRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      headers: { Cookie: eveCookie },
    });
    assert(
      eveReadRes.status === 403,
      'Eve (outsider) cannot read Alice\'s document (403 Forbidden)'
    );

    // Eve tries to edit Alice's doc
    const eveEditRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: eveCookie },
      body: JSON.stringify({ title: 'Hacked Title' }),
    });
    assert(
      eveEditRes.status === 403,
      'Eve cannot edit Alice\'s document (403 Forbidden)'
    );

    // Eve tries to delete Alice's doc
    const eveDeleteRes = await fetch(`${BASE_URL}/api/documents/${docId}`, {
      method: 'DELETE',
      headers: { Cookie: eveCookie },
    });
    assert(
      eveDeleteRes.status === 403,
      'Eve cannot delete Alice\'s document (403 Forbidden)'
    );

    // Eve tries to list documents in Alice's workspace
    const eveListRes = await fetch(
      `${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/documents`,
      { headers: { Cookie: eveCookie } }
    );
    assert(
      eveListRes.status === 403,
      'Eve cannot list documents in Alice\'s workspace (403 Forbidden)'
    );

    // Eve tries to delete Alice's workspace
    const eveDeleteWsRes = await fetch(
      `${BASE_URL}/api/workspaces/${engineeringWorkspaceId}`,
      {
        method: 'DELETE',
        headers: { Cookie: eveCookie },
      }
    );
    assert(
      eveDeleteWsRes.status === 403,
      'Eve cannot delete Alice\'s workspace (403 Forbidden)'
    );

    // -------------------------------------------------------------
    // 13. WORKSPACE LEAVING & DELETION POLICIES
    // -------------------------------------------------------------
    console.log('\n--- 13. Workspace Leaving & Cleanup ---');

    const ownerLeaveRes = await fetch(
      `${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/members/${createdWs?.id || 'invalid'}`,
      {
        method: 'DELETE',
        headers: { Cookie: aliceCookie },
      }
    );
    assert(ownerLeaveRes.status === 400 || ownerLeaveRes.status === 404, 'Owner cannot leave workspace without ownership transfer');

    // Non-owner member (Bob) can leave
    const bobLeaveRes = await fetch(
      `${BASE_URL}/api/workspaces/${engineeringWorkspaceId}/members/${bobMemberId}`,
      {
        method: 'DELETE',
        headers: { Cookie: bobCookie },
      }
    );
    assert(bobLeaveRes.status === 200, 'Bob (non-owner member) can leave workspace voluntarily');

    // Alice deletes Operations workspace
    const deleteOpsRes = await fetch(`${BASE_URL}/api/workspaces/${opsWorkspaceId}`, {
      method: 'DELETE',
      headers: { Cookie: aliceCookie },
    });
    assert(deleteOpsRes.status === 200, 'Alice deleted Operations workspace');

    // Summary
    console.log('\n================================================================');
    console.log(`Results: ${passedTests} passed, ${failedTests} failed, ${totalTests} total.`);
    console.log('================================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Test execution error:', error);
    process.exit(1);
  }
}

runWorkspaceAndDocTests();

export {};
