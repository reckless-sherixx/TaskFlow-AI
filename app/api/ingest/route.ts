import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const payload = await req.json();
        console.log('Received log payload:');
        console.dir(payload, { depth: null, colors: true });

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error(' Failed to parse log payload:', error);
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }
}
