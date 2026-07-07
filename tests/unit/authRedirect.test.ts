import { describe, expect, it } from 'vitest'
import { resolveLoginRedirect, safeInternalPath } from '../../utils/authRedirect'

describe('safeInternalPath', () => {
  it('keeps same-origin paths', () => {
    expect(safeInternalPath('/admin/dashboard', '/')).toBe('/admin/dashboard')
  })

  it('rejects external and protocol-relative paths', () => {
    expect(safeInternalPath('https://example.test', '/fallback')).toBe('/fallback')
    expect(safeInternalPath('//example.test/path', '/fallback')).toBe('/fallback')
  })

  it('rejects backslash protocol smuggling paths', () => {
    expect(safeInternalPath('/\\example.test/path', '/fallback')).toBe('/fallback')
  })
})

describe('resolveLoginRedirect', () => {
  it('sends admin-capable users to the dashboard when no redirect is supplied', () => {
    expect(resolveLoginRedirect('superadmin', undefined)).toBe('/admin/dashboard')
    expect(resolveLoginRedirect('admin', undefined)).toBe('/admin/dashboard')
    expect(resolveLoginRedirect('author', undefined)).toBe('/admin/dashboard')
  })

  it('sends viewers to the public homepage when no redirect is supplied', () => {
    expect(resolveLoginRedirect('viewer', undefined)).toBe('/')
  })

  it('preserves safe redirects for admin-capable users', () => {
    expect(resolveLoginRedirect('admin', '/admin/posts')).toBe('/admin/posts')
    expect(resolveLoginRedirect('author', '/profile')).toBe('/profile')
  })

  it('keeps viewers out of admin redirects', () => {
    expect(resolveLoginRedirect('viewer', '/admin/dashboard')).toBe('/')
  })

  it('falls back safely for unsafe redirects', () => {
    expect(resolveLoginRedirect('admin', 'https://example.test')).toBe('/admin/dashboard')
    expect(resolveLoginRedirect('viewer', '//example.test')).toBe('/')
  })
})