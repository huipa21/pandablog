import { estimateReadingMinutes, type ReadingTimeInput } from '~/utils/readingTime'

/** Returns a function that renders "N min read" for a post, or '' when unknown. */
export function useReadingTimeLabel() {
  const { t } = useI18n()

  return (input: ReadingTimeInput | null | undefined) => {
    const minutes = estimateReadingMinutes(input)
    return minutes ? t('public.post.minRead', { n: minutes }) : ''
  }
}
