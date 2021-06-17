
'use strict';

const wgslShaders = {
  vertex: `
struct VertexInput {
  [[location(0)]] position : vec3<f32>;
  [[location(1)]] uv : vec2<f32>;
};

struct VertexOutput {
  [[builtin(position)]] Position : vec4<f32>;
  [[location(0)]] fragUV : vec2<f32>;
};

[[stage(vertex)]]
fn main(input : VertexInput) -> VertexOutput {
    var output : VertexOutput;
    output.Position = vec4<f32>(input.position, 1.0);
    output.fragUV = input.uv;
    return output;
}
`,

  fragment: `
[[binding(0), group(0)]] var mySampler: sampler;
[[binding(1), group(0)]] var myTexture: texture_2d<f32>;

[[stage(fragment)]]
fn main([[location(0)]] fragUV : vec2<f32>) -> [[location(0)]] vec4<f32> {
  let angle = pow(max(0.5 - distance(fragUV, vec2<f32>(0.5)), 0.0) * 2.0, 2.0);
  let rotation = vec2<f32>(sin(angle), cos(angle));
  let fromCenter = fragUV - vec2<f32>(0.5);
  let rotatedPosition = vec2<f32>(
    fromCenter.x * rotation.y + fromCenter.y * rotation.x,
    fromCenter.y * rotation.y - fromCenter.x * rotation.x) + vec2<f32>(0.5);
  let quadrants = vec2<f32>(rotatedPosition.x * 2.0,
                            rotatedPosition.y * 2.0);
  return textureSample(myTexture, mySampler, quadrants);
}
`,
};

function webGPUNotSupported() {
  alert(
      'Your browser does not support WebGPU. See the note at the bottom of the page.');
}

const swapChainFormat = 'bgra8unorm';

class WebGPUTransform {
  constructor() {
    this.canvas_ = null;
    this.device_ = null;
    this.renderPipeline_ = null;
    /** GPU buffer */
    this.verticesBuffer_ = null;
    /** @private {string} */
    this.debugPath_ = 'debug.pipeline.frameTransform_';
  }

  /** @override */
  async init() {
    console.log('[WebGPUTransform] Initializing WebGPU.');

    this.canvas_ = new OffscreenCanvas(1, 1);
    // Uncomment these lines to get a visible canvas.
    //this.canvas_ = document.createElement('canvas');
    //document.getElementById('outputVideoContainer').appendChild(this.canvas_);

    this.context_ = this.canvas_.getContext('gpupresent');
    if (!this.context_) {
      webGPUNotSupported()
      return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      webGPUNotSupported()
      return;
    }
    this.device_ = await adapter.requestDevice();
    if (!this.device_) {
      webGPUNotSupported();
      return;
    }

    // Copies rectVerts to this.verticesBuffer_
    const rectVerts = new Float32Array([
      // position
      1.0, 1.0, 0.0,    //
      1.0, 0.0, 1.0,    //
      -1.0, 0.0, 1.0,   //
      1.0, -1.0, -1.0,  //
      0.0, 0.0, 1.0,    //
      1.0, 1.0, 0.0,    //
      // uv
      1.0, 0.0,    //
      -1.0, -1.0,  //
      0.0, 0.0,    //
      1.0, -1.0,   //
      1.0, 0.0,    //
      0.0, 0.0,    //
    ]);
    this.verticesBuffer_ = this.device_.createBuffer({
      size: rectVerts.byteLength,
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(this.verticesBuffer_.getMappedRange()).set(rectVerts);
    this.verticesBuffer_.unmap();

    this.renderPipeline_ = this.device_.createRenderPipeline({
      vertex: {
        module: this.device_.createShaderModule({
          code: wgslShaders.vertex,
        }),
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: 20,
            attributes: [
              {
                // position
                shaderLocation: 0,
                offset: 0,
                format: 'float32x3',
              },
              {
                // uv
                shaderLocation: 1,
                offset: 12,
                format: 'float32x2',
              },
            ],
          },
        ],
      },
      fragment: {
        module: this.device_.createShaderModule({
          code: wgslShaders.fragment,
        }),
        entryPoint: 'main',
        targets: [
          {
            format: swapChainFormat,
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    this.sampler_ = this.device_.createSampler({
      addressModeU: 'repeat',
      addressModeV: 'repeat',
      addressModeW: 'repeat',
      magFilter: 'linear',
      minFilter: 'linear',
    });
  }

  setSize(width, height) {
    this.canvas_.width = width;
    this.canvas_.height = height;
    this.context_.configure({
      device: this.device_,
      format: swapChainFormat,
    });
  }

  /** @override */
  async transform(frame, controller) {
    if (!this.device_ || !this.canvas_) {
      frame.close();
      return;
    }
    const width = frame.displayWidth;
    const height = frame.displayHeight;
    if (this.canvas_.width !== width || this.canvas_.height !== height) {
      this.setSize(width, height);
    }

    // Something like this should work, but isn't implemented yet:
    // const videoTexture = this.device_.experimentalImportTexture(frame,
    // GPUTextureUsage.SAMPLED);

    // Instead we use ImageBitmap as an intermediary.
    const size = {
      width,
      height,
      depthOrArrayLayers: 1,
    };
    const videoTexture = this.device_.createTexture({
      size,
      arrayLayerCount: 1,
      mipLevelCount: 1,
      sampleCount: 1,
      dimension: '2d',
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.SAMPLED,
    });
    const imageBitmap = await createImageBitmap(frame);
    this.device_.queue.copyImageBitmapToTexture(
        {imageBitmap, origin: {x: 0, y: 0}},
        {texture: videoTexture, origin: {x: 0, y: 0}}, {
          width,
          height,
        });
    imageBitmap.close();



    const uniformBindGroup = this.device_.createBindGroup({
      layout: this.renderPipeline_.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: this.sampler_,
        },
        {
          binding: 1,
          resource: videoTexture.createView(),
        },
      ],
    });

    const timestamp = frame.timestamp;
    frame.close();

    const commandEncoder = this.device_.createCommandEncoder();

    const textureView = this.context_.getCurrentTexture().createView();
    const renderPassDescriptor = {
      colorAttachments: [
        {
          view: textureView,
          loadValue: {r: 0.0, g: 0.0, b: 0.0, a: 1.0},
          storeOp: 'store',
        },
      ],
    };
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setViewport(0, 0, width, height, 1, 1);
    passEncoder.setPipeline(this.renderPipeline_);
    passEncoder.setVertexBuffer(0, this.verticesBuffer_);
    passEncoder.setBindGroup(0, uniformBindGroup);
    passEncoder.draw(6);
    passEncoder.endPass();
    this.device_.queue.submit([commandEncoder.finish()]);

    // This should work, but it doesn't.
    controller.enqueue(new VideoFrame(this.canvas_, {timestamp}));
    videoTexture.destroy();
  }

  /** @override */
  async destroy() {
    console.log('[WebGPUTransform] Freeing all WebGPU resources.');
    this.verticesBuffer_.destroy();
    // this.context_.unconfigure();
    this.device_ = null;
  }
}
