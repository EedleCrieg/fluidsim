
import { EdgeCondition } from '../types';

export class FluidSolver {
  private gl: WebGL2RenderingContext;
  private programs: { [key: string]: WebGLProgram } = {};
  private textures: { [key: string]: WebGLTexture } = {};
  private framebuffers: { [key: string]: WebGLFramebuffer } = {};
  
  public width: number;
  public height: number;
  public dt: number;
  public iterations: number = 32;

  // Particle System State
  private particleRes = 512; // 512x512 = 262k particles max
  private particleCount = 0;

  constructor(gl: WebGL2RenderingContext, width: number, height: number, dt: number) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.dt = dt;
    this.init();
  }

  private init() {
    const gl = this.gl;
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_half_float_linear');

    this.programs.advect = this.createProgram(vSource, advectSource);
    this.programs.divergence = this.createProgram(vSource, divergenceSource);
    this.programs.jacobi = this.createProgram(vSource, jacobiSource);
    this.programs.gradientSubtract = this.createProgram(vSource, gradientSubtractSource);
    this.programs.splat = this.createProgram(vSource, splatSource);
    this.programs.render = this.createProgram(vSource, renderSource);
    this.programs.clear = this.createProgram(vSource, clearSource);
    this.programs.vorticity = this.createProgram(vSource, vorticitySource);
    this.programs.vorticityForce = this.createProgram(vSource, vorticityForceSource);
    this.programs.buoyancy = this.createProgram(vSource, buoyancySource);
    this.programs.applyEmitter = this.createProgram(vSource, applyEmitterSource);
    this.programs.vectorField = this.createProgram(vVectorSource, fVectorSource);
    
    // Particle Programs
    this.programs.particleUpdate = this.createProgram(vSource, particleUpdateSource);
    this.programs.particleRender = this.createProgram(vParticleRenderSource, fParticleRenderSource);
    this.programs.particleInit = this.createProgram(vSource, particleInitSource);
    this.programs.fade = this.createProgram(vSource, fadeSource);

    this.textures.velocityA = this.createTexture();
    this.textures.velocityB = this.createTexture();
    this.textures.densityA = this.createTexture();
    this.textures.densityB = this.createTexture();
    this.textures.pressureA = this.createTexture();
    this.textures.pressureB = this.createTexture();
    this.textures.divergence = this.createTexture();
    this.textures.obstaclesA = this.createTexture();
    this.textures.obstaclesB = this.createTexture();
    this.textures.curl = this.createTexture();
    this.textures.emitter = this.createTexture();
    this.textures.massA = this.createTexture();
    this.textures.massB = this.createTexture();
    
    // Particle Textures
    this.textures.particlesA = this.createParticleTexture();
    this.textures.particlesB = this.createParticleTexture();
    this.textures.trailsA = this.createFullResTexture();
    this.textures.trailsB = this.createFullResTexture();

    this.framebuffers.fbo = gl.createFramebuffer()!;
    this.reset();
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Could not create WebGL shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)!);
    return shader;
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl;
    const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    return program;
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.width, this.height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    return texture;
  }

  private createFullResTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, gl.canvas.width, gl.canvas.height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    return texture;
  }

  private createParticleTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.particleRes, this.particleRes, 0, gl.RGBA, gl.FLOAT, null);
    return texture;
  }

  private updateTextureWrap(edgeCondition: EdgeCondition) {
    const gl = this.gl;
    const wrap = edgeCondition === EdgeCondition.PERIODIC ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    [this.textures.velocityA, this.textures.velocityB, this.textures.densityA, this.textures.densityB, this.textures.pressureA, this.textures.pressureB].forEach(tex => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    });
  }

  private drawQuad() { this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4); }

  public reset() {
    const gl = this.gl;
    gl.useProgram(this.programs.clear);
    [this.textures.velocityA, this.textures.velocityB, this.textures.densityA, this.textures.densityB, this.textures.pressureA, this.textures.pressureB, this.textures.divergence, this.textures.obstaclesA, this.textures.obstaclesB, this.textures.emitter, this.textures.massA, this.textures.massB, this.textures.particlesA, this.textures.particlesB, this.textures.trailsA, this.textures.trailsB].forEach(tex => {
      this.renderToTexture(tex, () => this.drawQuad());
    });
    this.particleCount = 0;
  }

  public step(viscosity: number, diffusion: number, velocityDissipation: number, vorticity: number, buoyancy: number, edgeCondition: EdgeCondition, compressibility: number, hasEmitter: boolean, emitterColor: number[] = [1,1,1], emitterStrength: number = 1.0, vorticityScale: number = 1.0) {
    const gl = this.gl;
    this.updateTextureWrap(edgeCondition);
    const edgeModeInt = edgeCondition === EdgeCondition.WALL ? 0 : (edgeCondition === EdgeCondition.PERIODIC ? 1 : 2);

    if (hasEmitter) {
      this.applyEmitter(emitterColor, emitterStrength);
    }

    // 1. Advect
    gl.useProgram(this.programs.advect);
    gl.uniform1i(gl.getUniformLocation(this.programs.advect, 'uEdgeMode'), edgeModeInt);
    gl.uniform1i(gl.getUniformLocation(this.programs.advect, 'uVelocity'), 0);
    gl.uniform1i(gl.getUniformLocation(this.programs.advect, 'uSource'), 1);
    gl.uniform1i(gl.getUniformLocation(this.programs.advect, 'uObstacles'), 2);
    
    this.advect(this.textures.velocityA, this.textures.velocityA, this.textures.velocityB, velocityDissipation);
    [this.textures.velocityA, this.textures.velocityB] = [this.textures.velocityB, this.textures.velocityA];

    this.advect(this.textures.velocityA, this.textures.densityA, this.textures.densityB, diffusion);
    [this.textures.densityA, this.textures.densityB] = [this.textures.densityB, this.textures.densityA];

    // 2. Vorticity
    if (vorticity > 0) {
      this.applyVorticity(vorticity, vorticityScale, edgeModeInt);
    }

    // 3. Buoyancy
    if (buoyancy > 0) {
      this.applyBuoyancy(buoyancy);
    }

    this.computeDivergence(edgeModeInt);
    this.solvePressure(edgeModeInt, compressibility);
    this.gradientSubtract(edgeModeInt);

    gl.useProgram(this.programs.clear);
    this.renderToTexture(this.textures.massA, () => this.drawQuad());

    // Particle Logic
    if (this.particleCount > 0) {
      this.updateParticles(edgeModeInt);
    }
  }

  private updateParticles(edgeMode: number) {
    const gl = this.gl;
    gl.useProgram(this.programs.particleUpdate);
    gl.uniform1i(gl.getUniformLocation(this.programs.particleUpdate, 'uParticles'), 0);
    gl.uniform1i(gl.getUniformLocation(this.programs.particleUpdate, 'uVelocity'), 1);
    gl.uniform1f(gl.getUniformLocation(this.programs.particleUpdate, 'uDt'), this.dt);
    gl.uniform1i(gl.getUniformLocation(this.programs.particleUpdate, 'uEdgeMode'), edgeMode);
    gl.uniform2f(gl.getUniformLocation(this.programs.particleUpdate, 'uTexelSize'), 1/this.width, 1/this.height);
    
    gl.viewport(0, 0, this.particleRes, this.particleRes);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures.particlesB, 0);
    
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.particlesA);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.textures.velocityA);
    
    this.drawQuad();
    [this.textures.particlesA, this.textures.particlesB] = [this.textures.particlesB, this.textures.particlesA];
  }

  public addParticles(x: number, y: number, radius: number, count: number) {
    const gl = this.gl;
    const start = this.particleCount;
    this.particleCount = Math.min(this.particleRes * this.particleRes, this.particleCount + count);
    
    gl.useProgram(this.programs.particleInit);
    gl.uniform1i(gl.getUniformLocation(this.programs.particleInit, 'uBase'), 0);
    gl.uniform2f(gl.getUniformLocation(this.programs.particleInit, 'uTarget'), x, y);
    gl.uniform1f(gl.getUniformLocation(this.programs.particleInit, 'uRadius'), radius);
    gl.uniform1f(gl.getUniformLocation(this.programs.particleInit, 'uSeed'), Math.random());
    gl.uniform1i(gl.getUniformLocation(this.programs.particleInit, 'uStartIdx'), start);
    gl.uniform1i(gl.getUniformLocation(this.programs.particleInit, 'uEndIdx'), this.particleCount);
    gl.uniform1f(gl.getUniformLocation(this.programs.particleInit, 'uRes'), this.particleRes);

    gl.viewport(0, 0, this.particleRes, this.particleRes);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures.particlesB, 0);
    
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.particlesA);
    this.drawQuad();
    [this.textures.particlesA, this.textures.particlesB] = [this.textures.particlesB, this.textures.particlesA];
  }

  private applyEmitter(color: number[], strength: number) {
    const gl = this.gl;
    gl.useProgram(this.programs.applyEmitter);
    gl.uniform1i(gl.getUniformLocation(this.programs.applyEmitter, 'uBase'), 0);
    gl.uniform1i(gl.getUniformLocation(this.programs.applyEmitter, 'uEmitter'), 1);
    gl.uniform3f(gl.getUniformLocation(this.programs.applyEmitter, 'uColor'), color[0], color[1], color[2]);
    gl.uniform1f(gl.getUniformLocation(this.programs.applyEmitter, 'uStrength'), strength);
    gl.uniform2f(gl.getUniformLocation(this.programs.applyEmitter, 'uTexelSize'), 1/this.width, 1/this.height);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.textures.emitter);
    gl.uniform1i(gl.getUniformLocation(this.programs.applyEmitter, 'uIsVelocity'), 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.densityA);
    this.renderToTexture(this.textures.densityB, () => this.drawQuad());
    [this.textures.densityA, this.textures.densityB] = [this.textures.densityB, this.textures.densityA];
    gl.uniform1i(gl.getUniformLocation(this.programs.applyEmitter, 'uIsVelocity'), 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.velocityA);
    this.renderToTexture(this.textures.velocityB, () => this.drawQuad());
    [this.textures.velocityA, this.textures.velocityB] = [this.textures.velocityB, this.textures.velocityA];
  }

  private applyVorticity(vorticity: number, scale: number, edgeMode: number) {
    const gl = this.gl;
    const effectiveScale = Math.min(Math.pow(scale, 1.6), this.width / 4.0);
    
    gl.useProgram(this.programs.vorticity);
    gl.uniform1i(gl.getUniformLocation(this.programs.vorticity, 'uVelocity'), 0);
    gl.uniform2f(gl.getUniformLocation(this.programs.vorticity, 'uTexelSize'), 1/this.width, 1/this.height);
    gl.uniform1f(gl.getUniformLocation(this.programs.vorticity, 'uScale'), effectiveScale);
    gl.uniform1i(gl.getUniformLocation(this.programs.vorticity, 'uEdgeMode'), edgeMode);
    gl.activeTexture(gl.TEXTURE0); 
    gl.bindTexture(gl.TEXTURE_2D, this.textures.velocityA);
    this.renderToTexture(this.textures.curl, () => this.drawQuad());

    gl.useProgram(this.programs.vorticityForce);
    gl.uniform1i(gl.getUniformLocation(this.programs.vorticityForce, 'uCurl'), 0);
    gl.uniform1i(gl.getUniformLocation(this.programs.vorticityForce, 'uVelocity'), 1);
    gl.uniform1f(gl.getUniformLocation(this.programs.vorticityForce, 'uDt'), this.dt);
    gl.uniform1f(gl.getUniformLocation(this.programs.vorticityForce, 'uCurlScale'), vorticity);
    gl.uniform1f(gl.getUniformLocation(this.programs.vorticityForce, 'uScale'), effectiveScale);
    gl.uniform2f(gl.getUniformLocation(this.programs.vorticityForce, 'uTexelSize'), 1/this.width, 1/this.height);
    gl.uniform1i(gl.getUniformLocation(this.programs.vorticityForce, 'uEdgeMode'), edgeMode);
    gl.activeTexture(gl.TEXTURE0); 
    gl.bindTexture(gl.TEXTURE_2D, this.textures.curl);
    gl.activeTexture(gl.TEXTURE1); 
    gl.bindTexture(gl.TEXTURE_2D, this.textures.velocityA);
    this.renderToTexture(this.textures.velocityB, () => this.drawQuad());
    [this.textures.velocityA, this.textures.velocityB] = [this.textures.velocityB, this.textures.velocityA];
  }

  private applyBuoyancy(buoyancy: number) {
    const gl = this.gl;
    gl.useProgram(this.programs.buoyancy);
    gl.uniform1i(gl.getUniformLocation(this.programs.buoyancy, 'uVelocity'), 0);
    gl.uniform1i(gl.getUniformLocation(this.programs.buoyancy, 'uDensity'), 1);
    gl.uniform1f(gl.getUniformLocation(this.programs.buoyancy, 'uDt'), this.dt);
    gl.uniform1f(gl.getUniformLocation(this.programs.buoyancy, 'uBuoyancy'), buoyancy);
    gl.activeTexture(gl.TEXTURE0); 
    gl.bindTexture(gl.TEXTURE_2D, this.textures.velocityA);
    gl.activeTexture(gl.TEXTURE1); 
    gl.bindTexture(gl.TEXTURE_2D, this.textures.densityA);
    this.renderToTexture(this.textures.velocityB, () => this.drawQuad());
    [this.textures.velocityA, this.textures.velocityB] = [this.textures.velocityB, this.textures.velocityA];
  }

  public splat(type: 'velocity' | 'density' | 'mass', x: number, y: number, color: number[], radius: number, isRadial: boolean = false, isErase: boolean = false, edgeCondition: EdgeCondition = EdgeCondition.WALL) {
    const gl = this.gl;
    gl.useProgram(this.programs.splat);
    gl.uniform1i(gl.getUniformLocation(this.programs.splat, 'uBase'), 0);
    gl.uniform2f(gl.getUniformLocation(this.programs.splat, 'uTarget'), x, y);
    gl.uniform1f(gl.getUniformLocation(this.programs.splat, 'uRadius'), radius);
    gl.uniform2f(gl.getUniformLocation(this.programs.splat, 'uTexelSize'), 1/this.width, 1/this.height);
    gl.uniform1i(gl.getUniformLocation(this.programs.splat, 'uPeriodic'), edgeCondition === EdgeCondition.PERIODIC ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.programs.splat, 'uErase'), isErase ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.programs.splat, 'uClamp'), 1);
    gl.uniform1i(gl.getUniformLocation(this.programs.splat, 'uRadial'), isRadial ? 1 : 0);
    gl.uniform3f(gl.getUniformLocation(this.programs.splat, 'uColor'), color[0], color[1], color[2]);
    let baseTex, targetTex;
    if (type === 'density') { baseTex = this.textures.densityA; targetTex = this.textures.densityB; } 
    else if (type === 'velocity') { baseTex = this.textures.velocityA; targetTex = this.textures.velocityB; } 
    else { baseTex = this.textures.massA; targetTex = this.textures.massB; }
    this.renderToTexture(targetTex, () => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, baseTex);
      this.drawQuad();
    });
    if (type === 'density') [this.textures.densityA, this.textures.densityB] = [this.textures.densityB, this.textures.densityA];
    else if (type === 'velocity') [this.textures.velocityA, this.textures.velocityB] = [this.textures.velocityB, this.textures.velocityA];
    else [this.textures.massA, this.textures.massB] = [this.textures.massB, this.textures.massA];
  }

  public setObstacle(x: number, y: number, radius: number, isEraser: boolean) {
    const gl = this.gl;
    gl.useProgram(this.programs.splat);
    gl.uniform1i(gl.getUniformLocation(this.programs.splat, 'uBase'), 0);
    gl.uniform2f(gl.getUniformLocation(this.programs.splat, 'uTarget'), x, y);
    gl.uniform1f(gl.getUniformLocation(this.programs.splat, 'uRadius'), radius); 
    gl.uniform3f(gl.getUniformLocation(this.programs.splat, 'uColor'), 1.0, 0, 0);
    gl.uniform1i(gl.getUniformLocation(this.programs.splat, 'uPeriodic'), 0);
    gl.uniform1i(gl.getUniformLocation(this.programs.splat, 'uClamp'), 1);
    gl.uniform1i(gl.getUniformLocation(this.programs.splat, 'uErase'), isEraser ? 1 : 0);
    this.renderToTexture(this.textures.obstaclesB, () => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.obstaclesA);
      this.drawQuad();
    });
    [this.textures.obstaclesA, this.textures.obstaclesB] = [this.textures.obstaclesB, this.textures.obstaclesA];
  }

  public setObstaclesBatch(buffer: Float32Array) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textures.obstaclesA);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.width, this.height, 0, gl.RGBA, gl.FLOAT, buffer);
  }

  public setEmitterBatch(buffer: Float32Array) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.textures.emitter);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.width, this.height, 0, gl.RGBA, gl.FLOAT, buffer);
  }

  public render(theme: string, normalStrength: number, showVelocity: boolean, showFluid: boolean, showParticles: boolean) {
    const gl = this.gl;
    
    // 1. Draw Trails to trails texture
    if (showParticles && this.particleCount > 0) {
      // Fade previous trails
      gl.useProgram(this.programs.fade);
      gl.uniform1f(gl.getUniformLocation(this.programs.fade, 'uFade'), 0.98); // Trail persistence
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.trailsA);
      this.renderToTexture(this.textures.trailsB, () => this.drawQuad(), gl.canvas.width, gl.canvas.height);
      [this.textures.trailsA, this.textures.trailsB] = [this.textures.trailsB, this.textures.trailsA];

      // Draw particles into trailsA
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.textures.trailsA, 0);
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      gl.useProgram(this.programs.particleRender);
      gl.uniform1i(gl.getUniformLocation(this.programs.particleRender, 'uParticles'), 0);
      gl.uniform1i(gl.getUniformLocation(this.programs.particleRender, 'uVelocity'), 1);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.particlesA);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.textures.velocityA);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // Additive trails
      gl.drawArrays(gl.POINTS, 0, this.particleCount);
      gl.disable(gl.BLEND);
    } else if (!showParticles) {
      // Clear trails if disabled
      gl.useProgram(this.programs.clear);
      this.renderToTexture(this.textures.trailsA, () => this.drawQuad(), gl.canvas.width, gl.canvas.height);
    }

    // 2. Main screen render
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.01, 0.02, 0.03, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (showFluid) {
      gl.useProgram(this.programs.render);
      gl.uniform1i(gl.getUniformLocation(this.programs.render, 'uDensity'), 0);
      gl.uniform1i(gl.getUniformLocation(this.programs.render, 'uVelocity'), 1);
      gl.uniform1i(gl.getUniformLocation(this.programs.render, 'uObstacles'), 2);
      gl.uniform1i(gl.getUniformLocation(this.programs.render, 'uPressure'), 3);
      gl.uniform1i(gl.getUniformLocation(this.programs.render, 'uCurl'), 4);
      gl.uniform1f(gl.getUniformLocation(this.programs.render, 'uNormalStrength'), normalStrength);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.densityA);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.textures.velocityA);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.textures.obstaclesA);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.textures.pressureA);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.textures.curl);
      gl.uniform2f(gl.getUniformLocation(this.programs.render, 'uTexelSize'), 1/this.width, 1/this.height);
      const themeMap: Record<string, number> = { kinetic: 0, velocity: 1, monochrome: 2, thermal: 3, vorticity: 4, pressure: 5, strain: 6, multichrome: 7 };
      gl.uniform1i(gl.getUniformLocation(this.programs.render, 'uTheme'), themeMap[theme] ?? 0);
      gl.uniform2f(gl.getUniformLocation(this.programs.render, 'uResolution'), gl.canvas.width, gl.canvas.height);
      this.drawQuad();
    }

    // Blend trails on top
    if (showParticles) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.programs.fade);
      gl.uniform1f(gl.getUniformLocation(this.programs.fade, 'uFade'), 1.0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.trailsA);
      this.drawQuad();
      gl.disable(gl.BLEND);
    }

    if (showVelocity) this.renderVelocityField();
  }

  private renderVelocityField() {
    const gl = this.gl;
    gl.useProgram(this.programs.vectorField);
    gl.uniform1i(gl.getUniformLocation(this.programs.vectorField, 'uVelocity'), 0);
    gl.uniform2f(gl.getUniformLocation(this.programs.vectorField, 'uTexelSize'), 1/this.width, 1/this.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.velocityA);
    const gridX = 40; const gridY = Math.ceil(gridX * (this.height / this.width));
    gl.uniform2f(gl.getUniformLocation(this.programs.vectorField, 'uGrid'), gridX, gridY);
    gl.drawArrays(gl.LINES, 0, gridX * gridY * 2);
  }

  private renderToTexture(texture: WebGLTexture, callback: () => void, customWidth?: number, customHeight?: number) {
    const gl = this.gl;
    gl.viewport(0, 0, customWidth || this.width, customHeight || this.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    callback();
  }

  private advect(velocity: WebGLTexture, source: WebGLTexture, target: WebGLTexture, dissipation: number) {
    const gl = this.gl;
    gl.uniform1f(gl.getUniformLocation(this.programs.advect, 'uDt'), this.dt);
    gl.uniform1f(gl.getUniformLocation(this.programs.advect, 'uDissipation'), 1.0 / (1.0 + dissipation * this.dt));
    gl.uniform2f(gl.getUniformLocation(this.programs.advect, 'uTexelSize'), 1/this.width, 1/this.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, velocity);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, source);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.textures.obstaclesA);
    this.renderToTexture(target, () => this.drawQuad());
  }

  private computeDivergence(edgeMode: number) {
    const gl = this.gl;
    gl.useProgram(this.programs.divergence);
    gl.uniform1i(gl.getUniformLocation(this.programs.divergence, 'uEdgeMode'), edgeMode);
    gl.uniform1i(gl.getUniformLocation(this.programs.divergence, 'uVelocity'), 0);
    gl.uniform1i(gl.getUniformLocation(this.programs.divergence, 'uObstacles'), 1);
    gl.uniform1i(gl.getUniformLocation(this.programs.divergence, 'uMass'), 2);
    gl.uniform2f(gl.getUniformLocation(this.programs.divergence, 'uTexelSize'), 1/this.width, 1/this.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.velocityA);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.textures.obstaclesA);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.textures.massA);
    this.renderToTexture(this.textures.divergence, () => this.drawQuad());
  }

  private solvePressure(edgeMode: number, compressibility: number) {
    const gl = this.gl;
    gl.useProgram(this.programs.jacobi);
    gl.uniform1i(gl.getUniformLocation(this.programs.jacobi, 'uEdgeMode'), edgeMode);
    gl.uniform1i(gl.getUniformLocation(this.programs.jacobi, 'uPressure'), 0);
    gl.uniform1i(gl.getUniformLocation(this.programs.jacobi, 'uDivergence'), 1);
    gl.uniform1i(gl.getUniformLocation(this.programs.jacobi, 'uObstacles'), 2);
    gl.uniform2f(gl.getUniformLocation(this.programs.jacobi, 'uTexelSize'), 1/this.width, 1/this.height);
    gl.uniform1f(gl.getUniformLocation(this.programs.jacobi, 'uCompressibility'), compressibility);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.textures.divergence);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.textures.obstaclesA);
    for (let i = 0; i < this.iterations; i++) {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.pressureA);
      this.renderToTexture(this.textures.pressureB, () => this.drawQuad());
      [this.textures.pressureA, this.textures.pressureB] = [this.textures.pressureB, this.textures.pressureA];
    }
  }

  private gradientSubtract(edgeMode: number) {
    const gl = this.gl;
    gl.useProgram(this.programs.gradientSubtract);
    gl.uniform1i(gl.getUniformLocation(this.programs.gradientSubtract, 'uEdgeMode'), edgeMode);
    gl.uniform1i(gl.getUniformLocation(this.programs.gradientSubtract, 'uPressure'), 0);
    gl.uniform1i(gl.getUniformLocation(this.programs.gradientSubtract, 'uVelocity'), 1);
    gl.uniform1i(gl.getUniformLocation(this.programs.gradientSubtract, 'uObstacles'), 2);
    gl.uniform2f(gl.getUniformLocation(this.programs.gradientSubtract, 'uTexelSize'), 1/this.width, 1/this.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.textures.pressureA);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.textures.velocityA);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.textures.obstaclesA);
    this.renderToTexture(this.textures.velocityB, () => this.drawQuad());
    [this.textures.velocityA, this.textures.velocityB] = [this.textures.velocityB, this.textures.velocityA];
  }
}

const vSource = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() { vUv = vec2(gl_VertexID % 2, gl_VertexID / 2) * 2.0 - 1.0; gl_Position = vec4(vUv, 0.0, 1.0); vUv = vUv * 0.5 + 0.5; }`;

const advectSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVelocity, uSource, uObstacles;
uniform float uDt, uDissipation;
uniform vec2 uTexelSize;
uniform int uEdgeMode; 
out vec4 outColor;
void main() {
  if (texture(uObstacles, vUv).r > 0.5) { outColor = vec4(0.0); return; }
  vec2 velocity = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * uTexelSize * velocity;
  if (uEdgeMode == 0) coord = clamp(coord, uTexelSize * 0.5, 1.0 - uTexelSize * 0.5); 
  else if (uEdgeMode == 2) if (coord.x < 0.0 || coord.x > 1.0 || coord.y < 0.0 || coord.y > 1.0) { outColor = vec4(0.0); return; }
  outColor = clamp(uDissipation * texture(uSource, coord), -100.0, 100.0);
}`;

const divergenceSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVelocity, uObstacles, uMass;
uniform vec2 uTexelSize;
uniform int uEdgeMode;
out vec4 outColor;
void main() {
  vec2 C = texture(uVelocity, vUv).xy;
  float L = texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y;
  if (uEdgeMode == 0) { if (vUv.x < uTexelSize.x) L = -C.x; if (vUv.x > 1.0 - uTexelSize.x) R = -C.x; if (vUv.y > 1.0 - uTexelSize.y) T = -C.y; if (vUv.y < uTexelSize.y) B = -C.y; }
  else if (uEdgeMode == 2) { if (vUv.x < uTexelSize.x) L = C.x; if (vUv.x > 1.0 - uTexelSize.x) R = C.x; if (vUv.y > 1.0 - uTexelSize.y) T = C.y; if (vUv.y < uTexelSize.y) B = C.y; }
  if (texture(uObstacles, vUv - vec2(uTexelSize.x, 0.0)).r > 0.5) L = -C.x;
  if (texture(uObstacles, vUv + vec2(uTexelSize.x, 0.0)).r > 0.5) R = -C.x;
  if (texture(uObstacles, vUv + vec2(0.0, uTexelSize.y)).r > 0.5) T = -C.y;
  if (texture(uObstacles, vUv - vec2(0.0, uTexelSize.y)).r > 0.5) B = -C.y;
  outColor = vec4(0.5 * (R - L + T - B) - texture(uMass, vUv).r, 0.0, 0.0, 1.0);
}`;

const jacobiSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPressure, uDivergence, uObstacles;
uniform vec2 uTexelSize;
uniform float uCompressibility;
uniform int uEdgeMode;
out vec4 outColor;
void main() {
  float C = texture(uPressure, vUv).r;
  float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).r;
  float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).r;
  float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).r;
  float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).r;
  if (uEdgeMode == 0) { if (vUv.x < uTexelSize.x) L = C; if (vUv.x > 1.0 - uTexelSize.x) R = C; if (vUv.y < uTexelSize.y) B = C; if (vUv.y > 1.0 - uTexelSize.y) T = C; }
  else if (uEdgeMode == 2) { if (vUv.x < uTexelSize.x) L = 0.0; if (vUv.x > 1.0 - uTexelSize.x) R = 0.0; if (vUv.y < uTexelSize.y) B = 0.0; if (vUv.y > 1.0 - uTexelSize.y) T = 0.0; }
  if (texture(uObstacles, vUv - vec2(uTexelSize.x, 0.0)).r > 0.5) L = C;
  if (texture(uObstacles, vUv + vec2(uTexelSize.x, 0.0)).r > 0.5) R = C;
  if (texture(uObstacles, vUv + vec2(0.0, uTexelSize.y)).r > 0.5) T = C;
  if (texture(uObstacles, vUv - vec2(0.0, uTexelSize.y)).r > 0.5) B = C;
  outColor = vec4((L + R + B + T - texture(uDivergence, vUv).r) / (4.0 + uCompressibility), 0.0, 0.0, 1.0);
}`;

const gradientSubtractSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPressure, uVelocity, uObstacles;
uniform vec2 uTexelSize;
uniform int uEdgeMode;
out vec4 outColor;
void main() {
  if (texture(uObstacles, vUv).r > 0.5) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float C = texture(uPressure, vUv).r;
  float L = texture(uPressure, vUv - vec2(uTexelSize.x, 0.0)).r;
  float R = texture(uPressure, vUv + vec2(uTexelSize.x, 0.0)).r;
  float T = texture(uPressure, vUv + vec2(0.0, uTexelSize.y)).r;
  float B = texture(uPressure, vUv - vec2(0.0, uTexelSize.y)).r;
  if (uEdgeMode == 0) { if (vUv.x < uTexelSize.x) L = C; if (vUv.x > 1.0 - uTexelSize.x) R = C; if (vUv.y < uTexelSize.y) B = C; if (vUv.y > 1.0 - uTexelSize.y) T = C; }
  else if (uEdgeMode == 2) { if (vUv.x < uTexelSize.x) L = 0.0; if (vUv.x > 1.0 - uTexelSize.x) R = 0.0; if (vUv.y < uTexelSize.y) B = 0.0; if (vUv.y > 1.0 - uTexelSize.y) T = 0.0; }
  outColor = vec4(texture(uVelocity, vUv).xy - 0.5 * vec2(R - L, T - B), 0.0, 1.0);
}`;

const splatSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uBase;
uniform vec3 uColor;
uniform vec2 uTarget;
uniform float uRadius;
uniform vec2 uTexelSize;
uniform bool uRadial, uErase, uClamp;
uniform int uPeriodic; 
out vec4 outColor;
void main() {
  vec2 d = vUv - uTarget; if (uPeriodic == 1) d = fract(d + 0.5) - 0.5; d.x *= uTexelSize.y / uTexelSize.x;
  float m = exp(-dot(d, d) / (uRadius * 3.5)); vec3 base = texture(uBase, vUv).xyz;
  vec3 res = uErase ? base * (1.0 - m) : base + m * (uRadial ? vec3(normalize(d + 1e-6) * uColor.r, 0.0) : uColor);
  outColor = vec4(uClamp ? clamp(res, -20.0, 20.0) : res, 1.0);
}`;

const applyEmitterSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uBase, uEmitter;
uniform vec3 uColor;
uniform float uStrength;
uniform vec2 uTexelSize;
uniform bool uIsVelocity;
out vec4 outColor;
void main() {
  vec4 base = texture(uBase, vUv); float emitC = length(texture(uEmitter, vUv).rgb);
  if (uIsVelocity) {
    float hL = length(texture(uEmitter, vUv - vec2(uTexelSize.x, 0.0)).rgb);
    float hR = length(texture(uEmitter, vUv + vec2(uTexelSize.x, 0.0)).rgb);
    float hB = length(texture(uEmitter, vUv - vec2(0.0, uTexelSize.y)).rgb);
    float hT = length(texture(uEmitter, vUv + vec2(0.0, uTexelSize.y)).rgb);
    outColor = vec4(base.xy + normalize(vec2(hL - hR, hB - hT) + 1e-6) * emitC * uStrength * 0.225, base.zw);
  } else {
    outColor = vec4(base.rgb + texture(uEmitter, vUv).rgb * uColor * uStrength * 0.0046875, 1.0);
  }
}`;

const vorticitySource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;
uniform float uScale;
uniform int uEdgeMode;
out vec4 outColor;
void main() {
  vec2 offset = uTexelSize * uScale;
  if (vUv.x < offset.x || vUv.x > 1.0 - offset.x || vUv.y < offset.y || vUv.y > 1.0 - offset.y) { outColor = vec4(0.0); return; }
  float L = texture(uVelocity, vUv - vec2(offset.x, 0.0)).y;
  float R = texture(uVelocity, vUv + vec2(offset.x, 0.0)).y;
  float T = texture(uVelocity, vUv + vec2(0.0, offset.y)).x;
  float B = texture(uVelocity, vUv - vec2(0.0, offset.y)).x;
  float curl = ((R - L) - (T - B)) / (1.0 + uScale * 0.1);
  outColor = vec4(clamp(0.5 * curl, -10.0, 10.0), 0.0, 0.0, 1.0);
}`;

const vorticityForceSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uCurl, uVelocity;
uniform float uDt, uCurlScale, uScale;
uniform vec2 uTexelSize;
uniform int uEdgeMode;
out vec4 outColor;
void main() {
  vec2 offset = uTexelSize * uScale;
  if (vUv.x < offset.x || vUv.x > 1.0 - offset.x || vUv.y < offset.y || vUv.y > 1.0 - offset.y) { outColor = texture(uVelocity, vUv); return; }
  float L = abs(texture(uCurl, vUv - vec2(offset.x, 0.0)).r);
  float R = abs(texture(uCurl, vUv + vec2(offset.x, 0.0)).r);
  float T = abs(texture(uCurl, vUv + vec2(0.0, offset.y)).r);
  float B = abs(texture(uCurl, vUv - vec2(0.0, offset.y)).r);
  vec2 force = vec2(T - B, L - R); float len = length(force); if (len > 1e-5) force /= len;
  float forceBoost = 1.0 + pow(clamp(uScale, 0.0, 48.0), 0.5) * 0.75;
  outColor = vec4(texture(uVelocity, vUv).xy + force * uCurlScale * texture(uCurl, vUv).r * uDt * forceBoost, 0.0, 1.0);
}`;

const buoyancySource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uVelocity, uDensity;
uniform float uDt, uBuoyancy;
out vec4 outColor;
void main() { vec2 vel = texture(uVelocity, vUv).xy; float dens = length(texture(uDensity, vUv).rgb); vel.y += uBuoyancy * dens * uDt; outColor = vec4(vel, 0.0, 1.0); }`;

const renderSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uDensity, uVelocity, uObstacles, uPressure, uCurl;
uniform int uTheme; uniform float uNormalStrength; uniform vec2 uResolution, uTexelSize;
out vec4 outColor;

vec3 hsv2rgb(vec3 c) { 
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); 
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); 
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); 
}

void main() {
  vec3 dens = texture(uDensity, vUv).rgb; 
  vec2 vel = texture(uVelocity, vUv).xy; 
  float obs = texture(uObstacles, vUv).r;
  
  if (obs > 0.5) { outColor = vec4(0.03, 0.04, 0.06, 1.0); return; }
  
  float hL = length(texture(uDensity, vUv - vec2(uTexelSize.x, 0.0)).rgb);
  float hR = length(texture(uDensity, vUv + vec2(uTexelSize.x, 0.0)).rgb);
  float hB = length(texture(uDensity, vUv - vec2(0.0, uTexelSize.y)).rgb);
  float hT = length(texture(uDensity, vUv + vec2(0.0, uTexelSize.y)).rgb);
  
  vec3 norm = normalize(vec3((hL - hR) * uNormalStrength, (hB - hT) * uNormalStrength, 1.0));
  vec3 lightDir = normalize(vec3(1.0, 1.0, 1.5));
  
  vec3 baseColor; 
  float speed = length(vel); 
  float hC = length(dens);
  
  if (uTheme == 7) { 
    float maxD = max(dens.r, max(dens.g, dens.b)); 
    if (maxD < 0.001) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; } 
    vec3 chromatic = dens / maxD;
    float strength = 1.0 - exp(-maxD * 4.0);
    baseColor = chromatic * strength;
  }
  else if (uTheme == 0) {
    float rawEnergy = 0.5 * hC * speed * speed;
    float energy = clamp(pow(rawEnergy * 0.000045, 0.65), 0.0, 1.0);
    vec3 c0 = vec3(0.12, 0.11, 0.29); vec3 c1 = vec3(0.26, 0.22, 0.79); vec3 c2 = vec3(0.85, 0.27, 0.94); vec3 c3 = vec3(0.98, 0.75, 0.14); vec3 c4 = vec3(1.0, 1.0, 1.0);
    if (energy < 0.25) baseColor = mix(c0, c1, energy * 4.0);
    else if (energy < 0.5) baseColor = mix(c1, c2, (energy - 0.25) * 4.0);
    else if (energy < 0.75) baseColor = mix(c2, c3, (energy - 0.5) * 4.0);
    else baseColor = mix(c3, c4, (energy - 0.75) * 4.0);
  }
  else if (uTheme == 1) {
    float angle = atan(vel.y, vel.x) / 6.283185 + 0.5;
    baseColor = hsv2rgb(vec3(angle, 0.8, min(speed * 0.4, 1.0)));
  }
  else if (uTheme == 2) { baseColor = mix(vec3(0.06, 0.09, 0.16), vec3(1.0), hC); }
  else if (uTheme == 3) {
    // THERMAL - Remapped to reserve hot colors for higher power densities
    // hC is accumulated density. We scale thresholds so white is reserved for high power.
    baseColor = mix(vec3(0.06, 0.09, 0.16), vec3(0.94, 0.27, 0.27), clamp(hC * 0.8, 0.0, 1.0));
    baseColor = mix(baseColor, vec3(1.0, 0.75, 0.14), clamp(hC * 0.4 - 0.5, 0.0, 1.0));
    baseColor = mix(baseColor, vec3(1.0, 1.0, 1.0), clamp(hC * 0.25 - 1.2, 0.0, 1.0));
  }
  else if (uTheme == 4) {
    float curl = texture(uCurl, vUv).r;
    baseColor = mix(vec3(0.06, 0.09, 0.16), vec3(0.23, 0.51, 0.96), clamp(-curl * 0.5, 0.0, 1.0));
    baseColor = mix(baseColor, vec3(0.94, 0.27, 0.27), clamp(curl * 0.5, 0.0, 1.0));
  }
  else if (uTheme == 5) {
    float p = texture(uPressure, vUv).r;
    baseColor = mix(vec3(0.06, 0.09, 0.16), vec3(0.13, 0.83, 0.93), clamp(p * 5.0, 0.0, 1.0));
    baseColor = mix(baseColor, vec3(0.85, 0.27, 0.94), clamp(-p * 5.0, 0.0, 1.0));
  }
  else if (uTheme == 6) {
    float s = length(texture(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).xy - texture(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).xy);
    baseColor = mix(vec3(0.06, 0.09, 0.16), vec3(0.98, 0.8, 0.08), clamp(s * 0.4, 0.0, 1.0));
  }
  else baseColor = dens;

  float diffuse = max(dot(norm, lightDir), 0.0);
  float specular = pow(max(dot(norm, normalize(lightDir + vec3(0.0, 0.0, 1.0))), 0.0), 60.0);
  vec3 final = baseColor * (diffuse * 0.5 + 0.5) + specular * 0.3 * clamp(hC * 2.0, 0.0, 1.0);
  if (uTheme == 7) outColor = vec4(final, 1.0); else outColor = vec4(1.0 - exp(-final * 2.2), 1.0);
}
`;

const particleInitSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uBase;
uniform vec2 uTarget;
uniform float uRadius, uSeed, uRes;
uniform int uStartIdx, uEndIdx;
out vec4 outColor;
float rand(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  int idx = int(vUv.y * uRes) * int(uRes) + int(vUv.x * uRes);
  if (idx >= uStartIdx && idx < uEndIdx) {
    float r = uRadius * sqrt(rand(vUv + uSeed));
    float theta = 6.283185 * rand(vUv - uSeed);
    outColor = vec4(uTarget.x + r * cos(theta), uTarget.y + r * sin(theta), 0.0, 1.0);
  } else {
    outColor = texture(uBase, vUv);
  }
}`;

const particleUpdateSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uParticles, uVelocity;
uniform float uDt;
uniform int uEdgeMode;
uniform vec2 uTexelSize;
out vec4 outColor;
void main() {
  vec4 p = texture(uParticles, vUv);
  if (p.w < 0.5) { outColor = p; return; }
  vec2 vel = texture(uVelocity, p.xy).xy;
  vec2 nextPos = p.xy + vel * uDt * 0.01;
  if (uEdgeMode == 0) nextPos = clamp(nextPos, uTexelSize, 1.0 - uTexelSize);
  else if (uEdgeMode == 1) nextPos = fract(nextPos);
  else if (nextPos.x < 0.0 || nextPos.x > 1.0 || nextPos.y < 0.0 || nextPos.y > 1.0) { outColor = vec4(-10.0, -10.0, 0.0, 0.0); return; }
  outColor = vec4(nextPos, 0.0, 1.0);
}`;

const vParticleRenderSource = `#version 300 es
precision highp float;
uniform sampler2D uParticles, uVelocity;
out vec3 vColor;
void main() {
  int id = gl_VertexID;
  int res = 512;
  vec2 uv = vec2(float(id % res) + 0.5, float(id / res) + 0.5) / float(res);
  vec4 p = texture(uParticles, uv);
  if (p.w < 0.5) { gl_Position = vec4(-100.0, -100.0, 0.0, 1.0); return; }
  gl_Position = vec4(p.xy * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
  vec2 vel = texture(uVelocity, p.xy).xy;
  float speed = length(vel);
  float energy = clamp(speed * 0.15, 0.0, 1.0);
  vec3 c0 = vec3(0.2, 0.4, 1.0); // Blue
  vec3 c1 = vec3(0.2, 1.0, 0.6); // Green/Cyan
  vec3 c2 = vec3(1.0, 0.8, 0.2); // Yellow/Orange
  vec3 c3 = vec3(1.0, 0.2, 0.1); // Red
  if (energy < 0.33) vColor = mix(c0, c1, energy * 3.0);
  else if (energy < 0.66) vColor = mix(c1, c2, (energy - 0.33) * 3.0);
  else vColor = mix(c2, c3, (energy - 0.66) * 3.0);
}`;

const fParticleRenderSource = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor, 0.6); }`;

const fadeSource = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uBase;
uniform float uFade;
out vec4 outColor;
void main() { outColor = texture(uBase, vUv) * uFade; }`;

const clearSource = `#version 300 es
precision highp float;
out vec4 outColor; void main() { outColor = vec4(0.0); }`;

const vVectorSource = `#version 300 es
precision highp float;
uniform sampler2D uVelocity; uniform vec2 uGrid; out float vAlpha;
void main() {
    int id = gl_VertexID / 2; int isEnd = gl_VertexID % 2;
    vec2 uv = (vec2(float(id % int(uGrid.x)), float(id / int(uGrid.x))) + 0.5) / uGrid;
    vec2 vel = texture(uVelocity, uv).xy; float speed = length(vel);
    vec2 pos = uv * 2.0 - 1.0; if (isEnd == 1) pos += (normalize(vel + 1e-6) * min(speed * 0.03, 0.025)) * 2.0;
    gl_Position = vec4(pos, 0.0, 1.0); vAlpha = clamp(speed * 0.5, 0.1, 0.8);
}`;

const fVectorSource = `#version 300 es
precision highp float;
in float vAlpha; out vec4 outColor; void main() { outColor = vec4(1.0, 1.0, 1.0, vAlpha); }`;
