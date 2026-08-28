import { NextRequest, NextResponse } from 'next/server'

const GIPHY_API_KEY = process.env.GIPHY_API_KEY || 'sXpGFDGZs0Dv1mmNFvYaGUvYwKX0PWIh'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')?.trim()
    const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10), 50)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    let endpoint = ''
    if (query) {
      endpoint = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=g`
    } else {
      endpoint = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=g`
    }

    const res = await fetch(endpoint, {
      next: { revalidate: 60 }, // Cache responses for 60 seconds
    })

    if (!res.ok) {
      return NextResponse.json({ gifs: [], error: 'Failed to fetch from Giphy' }, { status: 502 })
    }

    const data = await res.json()
    const gifs = (data.data || []).map((item: any) => ({
      id: item.id,
      title: item.title || 'GIF',
      url: item.images?.fixed_height?.url || item.images?.original?.url || '',
      previewUrl: item.images?.fixed_height_small?.url || item.images?.fixed_height?.url || '',
      width: parseInt(item.images?.fixed_height?.width || '200', 10),
      height: parseInt(item.images?.fixed_height?.height || '200', 10),
    })).filter((g: any) => g.url)

    return NextResponse.json({ gifs })
  } catch (err: any) {
    console.error('GIF API route error:', err)
    return NextResponse.json({ gifs: [], error: err.message || 'Internal server error' }, { status: 500 })
  }
}
