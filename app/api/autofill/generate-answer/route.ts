export const dynamic = 'force-dynamic'
export const runtime = 'edge'

import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  // Move OpenAI initialization INSIDE the function
  // so it only runs when someone actually calls the API
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  try {
    const body = await request.json()
    // ...rest of your code goes here...
    
    const response = await openai.chat.completions.create({
      // your existing openai call
    })

    return NextResponse.json({ result: response })
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
