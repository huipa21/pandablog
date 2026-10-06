import { BoundedAdmission } from './admission'
export const IMAGE_PIXEL_LIMIT = 40_000_000
export const imageDecoderOptions = {animated: false, limitInputPixels: IMAGE_PIXEL_LIMIT}
// Includes metadata, all transforms and pHash; queued work holds paths only.
export const imageAdmission = new BoundedAdmission({active: 1, waiting: 4, waitMs: 30_000}, 'Image work')
