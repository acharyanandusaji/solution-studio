import { describe, expect, it } from 'vitest'
import { base64ToBlob, base64ToBytes, blobToBase64, bytesToBase64 } from './encoding'

describe('cloud encoding', () => {
  it('round-trips binary data through base64', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 254, 255])
    const decoded = base64ToBytes(bytesToBase64(bytes))
    expect(Array.from(decoded)).toEqual(Array.from(bytes))
  })

  it('handles payloads larger than the chunk size', () => {
    const bytes = new Uint8Array(70_000)
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = index % 256
    }
    const decoded = base64ToBytes(bytesToBase64(bytes))
    expect(decoded.length).toBe(bytes.length)
    expect(decoded[0]).toBe(0)
    expect(decoded[65_535]).toBe(65_535 % 256)
    expect(decoded[bytes.length - 1]).toBe((bytes.length - 1) % 256)
  })

  it('builds a zip blob with the expected size and type', () => {
    const blob = base64ToBlob(bytesToBase64(new Uint8Array([1, 2, 3, 4])))
    expect(blob.size).toBe(4)
    expect(blob.type).toBe('application/zip')
  })

  it('reads a blob back into base64', async () => {
    const source = new Uint8Array([10, 20, 30])
    const encoded = await blobToBase64(new Blob([source]))
    expect(encoded).toBe(bytesToBase64(source))
  })
})
