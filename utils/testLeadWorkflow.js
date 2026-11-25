const BASE = 'http://localhost:5055/api';

async function run() {

    let token;

    async function request(path, method = 'GET', body) {

        const response = await fetch(`${BASE}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            ...(body ? { body: JSON.stringify(body) } : {})
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(`${method} ${path}: ${data.message}`);
        }

        return data;
    }

    const login = await request('/auth/login', 'POST', {
        email: 'director@demo.example',
        password: process.env.TEST_PASSWORD
    });

    token = login.token;

    console.log('✅ Director login successful');

    const masters = (await request('/masters')).data;

    console.log('✅ Master data loaded');
    console.log('Programs:', masters.programs.length);
    console.log('Sources:', masters.sources.length);
    console.log('Counsellors:', masters.counsellors.length);

    const lead = await request('/leads', 'POST', {
        full_name: 'Demo Student - Test Enquiry',
        phone: '0000000000',
        city: 'Mohali',
        previous_school: 'Demo Senior Secondary School',
        qualification: 'Class XII',
        branch_id: masters.branches[0].id,
        academic_session_id: masters.sessions[0].id,
        program_id: masters.programs[0].id,
        source_id: masters.sources[0].id,
        priority: 'HOT'
    });

    const id = lead.data.id;

    console.log('✅ Lead created:', id);

    await request(`/leads/${id}/assign`, 'PATCH', {
        assigned_to: masters.counsellors[0].id
    });

    console.log('✅ Counsellor assigned');

    await request(`/leads/${id}/status`, 'PATCH', {
        status: 'INTERESTED',
        remarks: 'Demo student interested in admission'
    });

    console.log('✅ Lead status updated');

    await request(`/leads/${id}/followups`, 'POST', {
        type: 'CALL',
        remarks: 'Discussed course details and admission process',
        outcome: 'Interested in campus visit',
        next_followup_at: new Date(
            Date.now() + 86400000
        ).toISOString()
    });

    console.log('✅ Follow-up recorded');

    const details = await request(`/leads/${id}`);

    console.log('✅ Lead details loaded');
    console.log('Status:', details.data.status);
    console.log('Follow-ups:', details.followups.length);
    console.log('History:', details.history.length);

    const list = await request('/leads');

    console.log('✅ Lead listing working');
    console.log('Total leads:', list.pagination.total);

    console.log('\n🎉 Complete CRM lead workflow successful');
}

run().catch(error => {
    console.error('❌', error.message);
    process.exitCode = 1;
});
