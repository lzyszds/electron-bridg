/**
 * 安全验证（邮箱验证码 / 谷歌验证器）的共享解析逻辑。
 * 主进程负责解析登录响应，渲染进程负责兜底与弹窗，两边共用同一份实现，
 * 避免出现「主进程认得出、渲染进程认不出」的分歧。
 */

/** 服务端错误码：登录需要二次安全验证 */
export const ERR_NEED_SECURITY_VERIFY = 20016

/** 验证方式：1 = 邮箱验证码 */
export const VERIFY_TYPE_EMAIL = '1'
/** 验证方式：2 = 谷歌验证器 */
export const VERIFY_TYPE_GOOGLE = '2'

/** 登录场景请求邮箱验证码时使用的业务类型 */
export const EMAIL_CODE_TYPE_LOGIN = 25

/**
 * 服务端要求的安全验证。
 * 解析不出具体的 verifiys 时，按默认的邮箱验证兜底，保证弹窗一定能弹出。
 */
export interface VerifyRequirement {
  /** 接收验证码的邮箱 */
  email: string
  /** 验证方式列表，元素为 '1'(邮箱验证码) / '2'(谷歌验证器) */
  verifiys: string[]
}

/** 兜底验证方式：解析不出 verifiys 时按邮箱验证处理 */
export const DEFAULT_VERIFY_TYPES: string[] = [VERIFY_TYPE_EMAIL]

/**
 * 从 errDlt 中提取 verifiys。
 * 各环境报文写法不统一，这里兼容常见的几种：
 *   verifiys=1,2 | verifiys=1,2,email=xx@yy.com | verifiys="1,2" | verifiys=[1,2] | verifiys: 1|2
 */
function extractVerifiys(text: string): string[] {
  const m = text.match(/["']?verifiys["']?\s*[:=]\s*(\[[^\]]*\]|["'][^"']*["']|\d[\d,\s|]*)/i)
  if (!m) return []
  // 统一抽出数字并按出现顺序去重，兼容 "[1, 2]" 与 "1|2" 等写法
  const types = m[1].match(/\d+/g) ?? []
  return Array.from(new Set(types))
}

/**
 * 从 errDlt 中提取邮箱，兼容 email=xx@yy.com / email: "xx@yy.com" / "email":"xx@yy.com"。
 * 必须含 @ 才认，避免把其他同名字段误当邮箱。
 */
function extractEmail(text: string): string {
  const m = text.match(/["']?email["']?\s*[:=]\s*["']?([^\s,;&"'}\]]+@[^\s,;&"'}\]]+)/i)
  return m?.[1] ?? ''
}

/**
 * 解析服务端下发的安全验证要求。
 * 未解析出 verifiys 时返回 null，由调用方决定是否按 DEFAULT_VERIFY_TYPES 兜底。
 */
export function parseVerifyRequirement(errDlt?: string, fallbackEmail = ''): VerifyRequirement | null {
  if (!errDlt) return null
  const verifiys = extractVerifiys(errDlt)
  if (verifiys.length === 0) return null
  return { verifiys, email: extractEmail(errDlt) || fallbackEmail }
}
