const fetch = require('node-fetch')
const RateLimiter = require('limiter').RateLimiter

const defaultOptions = {
  baseURL: 'https://app.useanvil.com',
}

const failBufferMS = 50

class Anvil {
  // {
  //   apiKey: <yourAPIKey>,
  //   accessToken: <yourAPIKey>, // OR oauth access token
  //   baseURL: 'https://app.useanvil.com'
  // }
  constructor (options) {
    if (!options) throw new Error('options are required')
    this.options = Object.assign({}, defaultOptions, options)
    if (!options.apiKey && !options.accessToken) throw new Error('apiKey or accessToken required')

    const { apiKey, accessToken } = this.options
    this.authHeader = accessToken
      ? `Bearer ${Buffer.from(accessToken, 'ascii').toString('base64')}`
      : `Basic ${Buffer.from(`${apiKey}:`, 'ascii').toString('base64')}`

    // Production apiKey rate limits: 200 in 5 seconds
    this.requestLimit = 200
    this.requestLimitMS = 5000
    this.limiter = new RateLimiter(this.requestLimit, this.requestLimitMS, true)
  }

  fillPDF (pdfTemplateID, payload, clientOptions = {}) {
    return this.requestREST(
      `/api/v1/fill/${pdfTemplateID}.pdf`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        // encoding: null,
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader,
        },
      },
      clientOptions,
    )
  }

  // Private

  async requestREST (url, options, clientOptions = {}) {
    return this.throttle(async (retry) => {
      const response = await this.request(url, options)
      const statusCode = response.status

      if (statusCode === 429) {
        return retry(getRetryMS(response.headers.get('retry-after')))
      }

      if (statusCode >= 300) {
        const json = await response.json()
        const errors = json.errors || (json.message && [json.message])

        if (errors) {
          return { statusCode, errors }
        }
        return { statusCode, ...json }
      }

      const { dataType } = clientOptions
      const data = dataType === 'stream' ? response.body : await response.buffer()
      return { statusCode, data }
    })
  }

  throttle (fn) {
    return new Promise((resolve, reject) => {
      this.limiter.removeTokens(1, async (err, remainingRequests) => {
        if (err) reject(err)
        if (remainingRequests < 1) {
          await sleep(this.requestLimitMS + failBufferMS)
        }
        const retry = async (ms) => {
          await sleep(ms)
          return this.throttle(fn)
        }
        try {
          resolve(await fn(retry))
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  request (url, options) {
    if (!url.startsWith(this.options.baseURL)) {
      url = this.url(url)
    }
    return fetch(url, options)
  }

  url (path) {
    return this.options.baseURL + path
  }
}

function getRetryMS (retryAfterSeconds) {
  return Math.round((Math.abs(parseFloat(retryAfterSeconds)) || 0) * 1000) + failBufferMS
}

function sleep (ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

module.exports = Anvil
