const BASE = 'http://localhost:5055/api';

async function run() {

    const loginResponse = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            email: 'director@demo.example',
            password: process.env.TEST_PASSWORD
        })
    });

    const login = await loginResponse.json();

    if (!loginResponse.ok) {
        throw new Error(login.message);
    }

    const response = await fetch(`${BASE}/dashboard`, {
        headers: {
            Authorization: `Bearer ${login.token}`
        }
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message);
    }

    const dashboard = result.data;

    console.log('✅ Director dashboard loaded');
    console.log('\nSUMMARY');
    console.table(dashboard.summary);

    console.log('\nADMISSION PIPELINE');
    console.table(dashboard.pipeline);

    console.log('\nCOUNSELLOR PERFORMANCE');
    console.table(dashboard.counsellorPerformance);

    console.log('\nCOURSE PERFORMANCE');
    console.table(dashboard.programPerformance);

    console.log('\nMARKETING SOURCES');
    console.table(dashboard.sourcePerformance);

    console.log('\n✅ Dashboard API working successfully');
}

run().catch(error => {
    console.error('❌', error.message);
    process.exitCode = 1;
});
