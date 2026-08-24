import { env, pipeline } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = true
env.backends.onnx.wasm.wasmPaths = '/vendor/transformers/'

let transcriberPromise = null

function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = pipeline(
      'automatic-speech-recognition',
      'onnx-community/whisper-base',
      {
        dtype: 'q4',
        progress_callback: (progress) => {
          self.postMessage({ type: 'progress', progress })
        },
      },
    ).catch((error) => {
      transcriberPromise = null
      throw error
    })
  }
  return transcriberPromise
}

self.onmessage = async (event) => {
  const { id, audio } = event.data
  try {
    self.postMessage({ type: 'status', id, status: 'loading_model' })
    const transcriber = await getTranscriber()
    self.postMessage({ type: 'status', id, status: 'transcribing' })
    const result = await transcriber(audio, {
      language: 'portuguese',
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
    })
    const text = typeof result.text === 'string' ? result.text.trim() : ''
    self.postMessage({ type: 'result', id, text })
  } catch {
    self.postMessage({
      type: 'error',
      id,
      message: 'Não foi possível transcrever este áudio localmente.',
    })
  }
}
