const nodemailer = require('nodemailer');

const EmailCommunication = require(
    '../models/EmailCommunication'
);

const {
    Institution,
    Program
} = require('../models');

const validEmail = value =>
    typeof value === 'string' &&
    value.length <= 190 &&
    /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value);

function getTransporter() {

    if (
        !process.env.SMTP_HOST ||
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASSWORD
    ) {
        throw new Error('SMTP is not configured');
    }

    return nodemailer.createTransport({

        host: process.env.SMTP_HOST,

        port: Number(
            process.env.SMTP_PORT || 587
        ),

        secure:
            process.env.SMTP_SECURE === 'true',

        requireTLS:
            process.env.SMTP_SECURE !== 'true',

        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
        },

        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000

    });
}

async function sendEmail({
    lead,
    subject,
    body,
    sentBy,
    type = 'MANUAL'
}) {

    if (!validEmail(lead.email)) {
        throw new Error('Valid recipient email required');
    }

    const mode = process.env.EMAIL_MODE || 'demo';

    if (mode === 'disabled') {
        return null;
    }

    const communication =
        await EmailCommunication.create({

            institution_id: lead.institution_id,
            lead_id: lead.id,
            sent_by: sentBy || null,

            recipient: lead.email,
            subject,
            body,
            type,

            status: 'PENDING'

        });

    // Prevent sending messages to synthetic demo students.
    if (
        mode === 'demo' ||
        lead.email.toLowerCase().endsWith('@demo.example') ||
        lead.remarks === 'SYNTHETIC_ADMISSION_DEMO_V1'
    ) {

        await communication.update({
            status: 'DEMO'
        });

        return communication;
    }

    try {

        if (mode !== 'smtp') {
            throw new Error('Unsupported email mode');
        }

        const transporter = getTransporter();

        const result = await transporter.sendMail({

            from: process.env.SMTP_FROM ||
                process.env.SMTP_USER,

            to: lead.email,

            subject,

            text: body

        });

        if (!result.accepted?.length) {
            throw new Error('Recipient not accepted');
        }

        await communication.update({

            status: 'SENT',

            message_id: result.messageId,

            sent_at: new Date()

        });

    } catch (error) {

        await communication.update({

            status: 'FAILED',

            error_message:
                String(error.code || 'EMAIL_SEND_FAILED')
                    .slice(0, 255)

        });
    }

    return communication;
}

async function sendConfirmation(lead, sentBy) {

    if (!validEmail(lead.email)) return null;

    if (process.env.EMAIL_MODE === 'disabled') {
        return null;
    }

    const institution = await Institution.findByPk(
        lead.institution_id
    );

    if (!institution || !institution.is_active) {
        return null;
    }

    const program = lead.program_id
        ? await Program.findOne({
            where: {
                id: lead.program_id,
                institution_id: lead.institution_id
            }
        })
        : null;

    const subject = 'Admission Enquiry Received';

    const body = `Dear ${lead.full_name},

Thank you for expressing your interest in ${institution.name}.

We have successfully received your admission enquiry.

Enquiry Reference: #${lead.id}
Interested Program: ${program?.name || 'Not specified'}

Our admission team will contact you to provide further information about the admission process, available programs and eligibility requirements.

We look forward to assisting you.

Warm regards,
Admissions Department
${institution.name}
${institution.phone || ''}
${institution.email || ''}`;

    return sendEmail({
        lead,
        subject,
        body,
        sentBy,
        type: 'AUTOMATIC'
    });
}

module.exports = {
    sendEmail,
    sendConfirmation,
    validEmail
};
