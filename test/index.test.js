const fs = require('fs')
const path = require('path')

const FormData = require('form-data')
const AbortSignal = require('abort-controller').AbortSignal
const Anvil = require('../src/index')

const assetsDir = path.join(__dirname, 'assets')

function mockNodeFetchResponse (options = {}) {
  const {
    status,
    json,
    buffer,
    headers,
    body,
  } = options

  const mock = {
    status,
  }

  if (json) {
    mock.json = () => json
  }

  if (buffer) {
    mock.buffer = () => buffer
  }

  if (body) {
    mock.body = body
  }

  if (headers) {
    mock.headers = {
      get: (header) => headers[header],
    }
  }

  return mock
}

describe('Anvil API Client', function () {
  describe('constructor', function () {
    it('throws an error when no options specified', async function () {
      expect(() => new Anvil()).to.throw('options are required')
    })

    it('throws an error when no apiKey or accessToken specified', async function () {
      expect(() => new Anvil({})).to.throw('apiKey or accessToken required')
    })

    it('builds a Basic auth header when apiKey passed in', async function () {
      const apiKey = 'abc123'
      const client = new Anvil({ apiKey })
      expect(client.authHeader).to.equal(`Basic ${Buffer.from(`${apiKey}:`, 'ascii').toString('base64')}`)
    })

    it('builds a Bearer auth header when accessToken passed in', async function () {
      const accessToken = 'def345'
      const client = new Anvil({ accessToken })
      expect(client.authHeader).to.equal(`Bearer ${Buffer.from(accessToken, 'ascii').toString('base64')}`)
    })
  })

  describe('REST endpoints', function () {
    let client

    beforeEach(async function () {
      client = new Anvil({ apiKey: 'abc123' })
      sinon.stub(client, '_request')
    })

    describe('requestREST', function () {
      let options, clientOptions, data, result

      it('returns statusCode and data when specified', async function () {
        options = {
          method: 'POST',
        }
        clientOptions = {
          dataType: 'json',
        }
        data = { result: 'ok' }

        client._request.callsFake((url, options) => {
          return Promise.resolve(
            mockNodeFetchResponse({
              status: 200,
              json: data,
            }),
          )
        })
        const result = await client.requestREST('/test', options, clientOptions)

        expect(client._request).to.have.been.calledOnce
        expect(result.statusCode).to.eql(200)
        expect(result.data).to.eql(data)
      })

      it('rejects promise when error', async function () {
        options = { method: 'POST' }

        client._request.callsFake((url, options) => {
          throw new Error('problem')
        })

        await expect(client.requestREST('/test', options)).to.eventually.have.been.rejectedWith('problem')
      })

      it('retries when a 429 response', async function () {
        options = { method: 'POST' }
        clientOptions = { dataType: 'json' }
        data = { result: 'ok' }

        client._request.onCall(0).callsFake((url, options) => {
          return Promise.resolve(
            mockNodeFetchResponse({
              status: 429,
              headers: {
                'retry-after': '0.2', // in seconds
              },
            }),
          )
        })

        client._request.onCall(1).callsFake((url, options) => {
          return Promise.resolve(
            mockNodeFetchResponse({
              status: 200,
              json: data,
            }),
          )
        })

        result = await client.requestREST('/test', options, clientOptions)

        expect(client._request).to.have.been.calledTwice
        expect(result.statusCode).to.eql(200)
        expect(result.data).to.eql(data)
      })
    })

    describe('fillPDF', function () {
      def('statusCode', 200)

      beforeEach(async function () {
        client._request.callsFake((url, options) => {
          return Promise.resolve(
            mockNodeFetchResponse({
              status: $.statusCode,
              buffer: $.buffer,
              json: $.json,
            }),
          )
        })
      })

      context('everything goes well', function () {
        def('buffer', 'This would be PDF data...')

        it('returns data', async function () {
          const payload = {
            title: 'Test',
            fontSize: 8,
            textColor: '#CC0000',
            data: {
              helloId: 'hello!',
            },
          }

          const result = await client.fillPDF('cast123', payload)

          expect(result.statusCode).to.eql(200)
          expect(result.data).to.eql('This would be PDF data...')

          expect(client._request).to.have.been.calledOnce

          const [url, options] = client._request.lastCall.args
          expect(url).to.eql('/api/v1/fill/cast123.pdf')
          expect(options).to.eql({
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
              'Content-Type': 'application/json',
            },
          })
        })
      })

      context('server 400s with errors array in JSON', function () {
        const errors = [{ message: 'problem' }]
        def('statusCode', 400)
        def('json', { errors })

        it('finds errors and puts them in response', async function () {
          const result = await client.fillPDF('cast123', {})

          expect(client._request).to.have.been.calledOnce
          expect(result.statusCode).to.eql(400)
          expect(result.errors).to.eql(errors)
        })
      })

      context('server 401s with single error in response', function () {
        const error = { name: 'AuthorizationError', message: 'problem' }
        def('statusCode', 401)
        def('json', error)

        it('finds error and puts it in the response', async function () {
          const result = await client.fillPDF('cast123', {})

          expect(client._request).to.have.been.calledOnce
          expect(result.statusCode).to.eql(401)
          expect(result.errors).to.eql([error])
        })
      })
    })

    describe('generatePDF', function () {
      def('statusCode', 200)

      beforeEach(async function () {
        client._request.callsFake((url, options) => {
          return Promise.resolve(
            mockNodeFetchResponse({
              status: $.statusCode,
              buffer: $.buffer,
              json: $.json,
            }),
          )
        })
      })

      context('everything goes well', function () {
        def('buffer', 'This would be PDF data...')

        it('returns data', async function () {
          const payload = {
            title: 'Test',
            data: [{
              label: 'hello!',
            }],
          }

          const result = await client.generatePDF(payload)

          expect(result.statusCode).to.eql(200)
          expect(result.data).to.eql('This would be PDF data...')

          expect(client._request).to.have.been.calledOnce

          const [url, options] = client._request.lastCall.args
          expect(url).to.eql('/api/v1/generate-pdf')
          expect(options).to.eql({
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
              'Content-Type': 'application/json',
            },
          })
        })
      })

      context('server 400s with errors array in JSON', function () {
        const errors = [{ message: 'problem' }]
        def('statusCode', 400)
        def('json', { errors })

        it('finds errors and puts them in response', async function () {
          const result = await client.generatePDF('cast123', {})

          expect(client._request).to.have.been.calledOnce
          expect(result.statusCode).to.eql(400)
          expect(result.errors).to.eql(errors)
        })
      })

      context('server 401s with single error in response', function () {
        const error = { name: 'AuthorizationError', message: 'problem' }
        def('statusCode', 401)
        def('json', error)

        it('finds error and puts it in the response', async function () {
          const result = await client.generatePDF('cast123', {})

          expect(client._request).to.have.been.calledOnce
          expect(result.statusCode).to.eql(401)
          expect(result.errors).to.eql([error])
        })
      })
    })

    describe('downloadDocuments', function () {
      def('statusCode', 200)
      def('buffer', 'This would be Zip file data buffer...')
      def('body', 'This would be Zip file data stream')
      def('nodeFetchResponse', () => mockNodeFetchResponse({
        status: $.statusCode,
        buffer: $.buffer,
        body: $.body,
        json: $.json,
      }))

      beforeEach(async function () {
        client._request.callsFake((url, options) => {
          return Promise.resolve($.nodeFetchResponse)
        })
      })

      context('everything goes well', function () {
        it('returns data as buffer', async function () {
          const { statusCode, response, data, errors } = await client.downloadDocuments('docGroupEid123')
          expect(statusCode).to.eql(200)
          expect(response).to.deep.eql($.nodeFetchResponse)
          expect(data).to.eql($.buffer)
          expect(errors).to.be.undefined
        })

        it('returns data as stream', async function () {
          const { statusCode, response, data, errors } = await client.downloadDocuments('docGroupEid123', { dataType: 'stream' })
          expect(statusCode).to.eql(200)
          expect(response).to.deep.eql($.nodeFetchResponse)
          expect(data).to.eql($.body)
          expect(errors).to.be.undefined
        })
      })

      context('unsupported options', function () {
        it('raises appropriate error', async function () {
          try {
            await client.downloadDocuments('docGroupEid123', { dataType: 'json' })
          } catch (e) {
            expect(e.message).to.eql('dataType must be one of: stream|buffer')
          }
        })
      })

      context('server 400s with errors array in JSON', function () {
        const errors = [{ message: 'problem' }]
        def('statusCode', 400)
        def('json', { errors })

        it('finds errors and puts them in response', async function () {
          const { statusCode, errors } = await client.downloadDocuments('docGroupEid123')

          expect(client._request).to.have.been.calledOnce
          expect(statusCode).to.eql(400)
          expect(errors).to.eql(errors)
        })
      })

      context('server 401s with single error in response', function () {
        const error = { name: 'AuthorizationError', message: 'problem' }
        def('statusCode', 401)
        def('json', error)

        it('finds error and puts it in the response', async function () {
          const { statusCode, errors } = await client.downloadDocuments('docGroupEid123')

          expect(client._request).to.have.been.calledOnce
          expect(statusCode).to.eql(401)
          expect(errors).to.eql([error])
        })
      })
    })
  })

  describe('GraphQL', function () {
    const client = new Anvil({ apiKey: 'abc123' })

    describe('requestGraphQL', function () {
      beforeEach(function () {
        sinon.stub(client, '_wrapRequest')
        client._wrapRequest.callsFake(async () => ({}))
        sinon.stub(client, '_request')
      })

      afterEach(function () {
        client._wrapRequest.restore()
        client._request.restore()
      })

      describe('without files', function () {
        it('stringifies query and variables', function () {
          const query = { foo: 'bar' }
          const variables = { baz: 'bop' }
          const clientOptions = { yo: 'mtvRaps' }

          client.requestGraphQL({ query, variables }, clientOptions)

          expect(client._wrapRequest).to.have.been.calledOnce

          const [fn, clientOptionsReceived] = client._wrapRequest.lastCall.args
          expect(clientOptions).to.eql(clientOptionsReceived)

          fn()

          expect(client._request).to.have.been.calledOnce
          const [, options] = client._request.lastCall.args
          const {
            method,
            headers,
            body,
          } = options

          expect(method).to.eql('POST')
          expect(headers).to.eql({ 'Content-Type': 'application/json' })
          expect(body).to.eql(JSON.stringify({ query, variables }))
        })
      })

      describe('with files', function () {
        beforeEach(function () {
          sinon.spy(FormData.prototype, 'append')
        })

        afterEach(function () {
          FormData.prototype.append.restore()
        })

        describe('schema is good', function () {
          const query = { foo: 'bar' }
          const clientOptions = { yo: 'mtvRaps' }

          afterEach(function () {
            expect(client._wrapRequest).to.have.been.calledOnce

            const [fn, clientOptionsReceived] = client._wrapRequest.lastCall.args
            expect(clientOptions).to.eql(clientOptionsReceived)

            fn()

            expect(client._request).to.have.been.calledOnce
            const [, options] = client._request.lastCall.args

            const {
              method,
              headers,
              body,
              signal,
            } = options

            expect(method).to.eql('POST')
            if ($.isBase64) {
              expect(headers).to.eql({
                'Content-Type': 'application/json',
              })
              // Vars are untouched
              expect(JSON.parse(body).variables).to.eql($.variables)
            } else {
              expect(headers).to.eql({}) // node-fetch will add appropriate header
              expect(body).to.be.an.instanceof(FormData)
              expect(signal).to.be.an.instanceof(AbortSignal)
              expect(
                FormData.prototype.append.withArgs(
                  'map',
                  JSON.stringify({ 1: ['variables.aNested.file'] }),
                ),
              ).calledOnce
            }
          })

          context('file is a Buffer', function () {
            def('variables', () => ({
              aNested: {
                file: Buffer.from(''),
              },
            }))

            it('creates a FormData and appends the files map', function () {
              client.requestGraphQL({ query, variables: $.variables }, clientOptions)
            })
          })

          context('file is a Stream', function () {
            def('variables', () => {
              const file = fs.createReadStream(path.join(assetsDir, 'dummy.pdf'))
              return {
                aNested: {
                  file,
                },
              }
            })

            it('creates a FormData and appends the files map', function () {
              client.requestGraphQL({ query, variables: $.variables }, clientOptions)
            })
          })

          context('file is a base64 upload', function () {
            def('isBase64', () => true)
            def('variables', () => {
              return {
                aNested: {
                  file: {
                    data: Buffer.from('Base64 Data').toString('base64'),
                    filename: 'omgwow.pdf',
                    mimetype: 'application/pdf',
                  },
                },
              }
            })

            it('does not touch the variables at all', function () {
              client.requestGraphQL({ query, variables: $.variables }, clientOptions)
            })
          })
        })

        describe('schema is not good', function () {
          context('file is not a stream or buffer', function () {
            it('throws error about the schema', async function () {
              const query = { foo: 'bar' }
              const variables = {
                file: 'i am not a file',
              }

              await expect(client.requestGraphQL({ query, variables })).to.eventually.be.rejectedWith('Invalid File schema detected')
            })
          })
        })
      })
    })

    describe('createEtchPacket', function () {
      beforeEach(function () {
        sinon.stub(client, 'requestGraphQL')
      })

      afterEach(function () {
        client.requestGraphQL.restore()
      })

      context('mutation is specified', function () {
        it('calls requestGraphQL with overridden mutation', function () {
          const variables = { foo: 'bar' }
          const mutationOverride = 'createEtchPacketOverride()'

          client.createEtchPacket({ variables, mutation: mutationOverride })

          expect(client.requestGraphQL).to.have.been.calledOnce
          const [options, clientOptions] = client.requestGraphQL.lastCall.args

          const {
            query,
            variables: variablesReceived,
          } = options

          expect(variables).to.eql(variablesReceived)
          expect(query).to.include(mutationOverride)
          expect(clientOptions).to.eql({ dataType: 'json' })
        })
      })

      context('no responseQuery specified', function () {
        it('calls requestGraphQL with default responseQuery', function () {
          const variables = { foo: 'bar' }

          client.createEtchPacket({ variables })

          expect(client.requestGraphQL).to.have.been.calledOnce
          const [options, clientOptions] = client.requestGraphQL.lastCall.args

          const {
            query,
            variables: variablesReceived,
          } = options

          expect(variables).to.eql(variablesReceived)
          expect(query).to.include('documentGroup {') // "documentGroup" is in the default responseQuery
          expect(clientOptions).to.eql({ dataType: 'json' })
        })
      })

      context('responseQuery specified', function () {
        it('calls requestGraphQL with overridden responseQuery', function () {
          const variables = { foo: 'bar' }
          const responseQuery = 'onlyInATest {}'

          client.createEtchPacket({ variables, responseQuery })

          expect(client.requestGraphQL).to.have.been.calledOnce
          const [options, clientOptions] = client.requestGraphQL.lastCall.args

          const {
            query,
            variables: variablesReceived,
          } = options

          expect(variables).to.eql(variablesReceived)
          expect(query).to.include(responseQuery)
          expect(clientOptions).to.eql({ dataType: 'json' })
        })
      })
    })

    describe('generateEtchSignUrl', function () {
      def('statusCode', 200)
      beforeEach(async function () {
        sinon.stub(client, '_request')
        client._request.callsFake((url, options) => {
          return Promise.resolve($.nodeFetchResponse)
        })
      })
      afterEach(function () {
        client._request.restore()
      })

      context('everything goes well', function () {
        def('data', {
          data: {
            generateEtchSignURL: 'http://www.testing.com',
          },
        })
        def('nodeFetchResponse', () => mockNodeFetchResponse({
          status: $.statusCode,
          json: $.data,
        }))

        it('returns url successfully', async function () {
          const variables = { clientUserId: 'foo', signerEid: 'bar' }
          const { statusCode, url, errors } = await client.generateEtchSignUrl({ variables })
          expect(statusCode).to.eql(200)
          expect(url).to.be.eql($.data.data.generateEtchSignURL)
          expect(errors).to.be.undefined
        })
      })

      context('generate URL failures', function () {
        def('data', {
          data: {},
        })
        def('nodeFetchResponse', () => mockNodeFetchResponse({
          status: $.statusCode,
          json: $.data,
        }))

        it('returns undefined url', async function () {
          const variables = { clientUserId: 'foo', signerEid: 'bar' }
          const { statusCode, url, errors } = await client.generateEtchSignUrl({ variables })
          expect(statusCode).to.eql(200)
          expect(url).to.be.undefined
          expect(errors).to.be.undefined
        })
      })
    })

    describe('getEtchPacket', function () {
      def('variables', { eid: 'etchPacketEid123' })
      beforeEach(function () {
        sinon.stub(client, 'requestGraphQL')
      })

      afterEach(function () {
        client.requestGraphQL.restore()
      })

      context('no responseQuery specified', function () {
        it('calls requestGraphQL with default responseQuery', async function () {
          client.getEtchPacket({ variables: $.variables })

          expect(client.requestGraphQL).to.have.been.calledOnce
          const [options, clientOptions] = client.requestGraphQL.lastCall.args

          const {
            query,
            variables: variablesReceived,
          } = options

          expect($.variables).to.eql(variablesReceived)
          expect(query).to.include('documentGroup {')
          expect(clientOptions).to.eql({ dataType: 'json' })
        })
      })

      context('responseQuery specified', function () {
        it('calls requestGraphQL with overridden responseQuery', async function () {
          const responseQuery = 'myCustomResponseQuery'
          client.getEtchPacket({ variables: $.variables, responseQuery })

          expect(client.requestGraphQL).to.have.been.calledOnce
          const [options, clientOptions] = client.requestGraphQL.lastCall.args

          const {
            query,
            variables: variablesReceived,
          } = options

          expect($.variables).to.eql(variablesReceived)
          expect(query).to.include(responseQuery)
          expect(clientOptions).to.eql({ dataType: 'json' })
        })
      })
    })
  })
})
