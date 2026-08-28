import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabaseServer'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const supabase = createSupabaseAdmin()
    const buffer = Buffer.from(await file.arrayBuffer())

    const mime = file.type || 'image/gif'
    let ext = 'gif'
    if (mime.includes('png')) ext = 'png'
    else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg'
    else if (mime.includes('webp')) ext = 'webp'
    else if (mime.includes('gif')) ext = 'gif'

    const fileName = `uploads/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`

    const { error } = await supabase.storage
      .from('chat-media')
      .upload(fileName, buffer, {
        contentType: mime,
        upsert: true,
      })

    if (error) {
      console.error('Storage upload error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: pubData } = supabase.storage
      .from('chat-media')
      .getPublicUrl(fileName)

    return NextResponse.json({ url: pubData.publicUrl })
  } catch (err: any) {
    console.error('Upload route error:', err)
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 })
  }
}
