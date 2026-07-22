import { desktopCapturer, screen } from 'electron'

export interface CaptureResult {
  image: string
  width: number
  height: number
  displayId: string
  timestamp: number
  visualSignature: number[]
}

export interface VisualChange {
  changedCellRatio: number
  averageLumaDelta: number
}

export interface CaptureOptions {
  displayId?: string
  /** When true, capture a small thumbnail for change detection only (much faster). */
  signatureOnly?: boolean
}

export class CaptureService {
  static async capture(options: CaptureOptions = {}): Promise<CaptureResult> {
    try {
      const primaryDisplay = screen.getPrimaryDisplay()
      if (!primaryDisplay) {
        throw new Error('No primary display found')
      }
      
      const { width, height } = primaryDisplay.size
      const scaleFactor = primaryDisplay.scaleFactor || 1

      // Cap capture resolution (e.g. 1280px width) for fast, smooth capture without mouse lag.
      const maxCapWidth = 1280
      const calcWidth = Math.round(width * scaleFactor)
      const targetWidth = options.signatureOnly ? 192 : Math.min(maxCapWidth, calcWidth)
      const targetHeight = options.signatureOnly ? 108 : Math.round(targetWidth * (height / width))
      const thumbnailSize = { width: targetWidth, height: targetHeight }

      // Query desktop capturer sources
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize
      })

      if (!sources || sources.length === 0) {
        throw new Error('No screen capture sources available')
      }

      // Capture the primary screen source
      const primarySource = sources[0]
      if (!primarySource.thumbnail || primarySource.thumbnail.isEmpty()) {
        throw new Error('Captured screen image is empty or invalid')
      }

      return {
        image: options.signatureOnly ? '' : primarySource.thumbnail.toDataURL(),
        width,
        height,
        displayId: primaryDisplay.id.toString(),
        timestamp: Date.now(),
        visualSignature: this.createVisualSignature(primarySource.thumbnail)
      }
    } catch (error: any) {
      console.error('Error during screen capture:', error)
      throw new Error(error?.message || 'Failed to capture screen due to system error')
    }
  }

  /**
   * Creates a compact luminance map so guidance can compare the actual screen
   * instead of relying on PNG compression size as a change signal.
   */
  static compareVisualSignatures(previous: number[], current: number[]): VisualChange {
    if (previous.length === 0 || previous.length !== current.length) {
      return { changedCellRatio: 1, averageLumaDelta: 255 }
    }

    let changedCells = 0
    let totalDelta = 0

    for (let index = 0; index < current.length; index += 1) {
      const delta = Math.abs(current[index] - previous[index])
      totalDelta += delta
      if (delta >= 18) changedCells += 1
    }

    return {
      changedCellRatio: changedCells / current.length,
      averageLumaDelta: totalDelta / current.length
    }
  }

  private static createVisualSignature(thumbnail: Electron.NativeImage): number[] {
    const bitmap = thumbnail.toBitmap()
    const { width, height } = thumbnail.getSize()
    const columns = 48
    const rows = 27
    const signature: number[] = []

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        let lumaSum = 0

        for (const yOffset of [0.3, 0.7]) {
          for (const xOffset of [0.3, 0.7]) {
            const x = Math.min(width - 1, Math.floor((column + xOffset) * width / columns))
            const y = Math.min(height - 1, Math.floor((row + yOffset) * height / rows))
            const pixelOffset = (y * width + x) * 4

            // NativeImage returns BGRA pixels on Windows.
            const blue = bitmap[pixelOffset]
            const green = bitmap[pixelOffset + 1]
            const red = bitmap[pixelOffset + 2]
            lumaSum += (red * 0.299) + (green * 0.587) + (blue * 0.114)
          }
        }

        signature.push(Math.round(lumaSum / 4))
      }
    }

    return signature
  }
}
