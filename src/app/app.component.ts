import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  @ViewChild('glCanvas') glCanvas;

  private playingSound = false;
  private audioContext: AudioContext;
  private frameCount: number;
  private noiseBuf: AudioBuffer;
  private gainNode: GainNode;
  private gl: WebGLRenderingContext;

  private vertexShader = `
  attribute vec4 a_position;

  void main() {
    gl_Position = a_position;
  }`

  private fragShader = `
  precision highp float;

  uniform float time;

  vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
  vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}
  
  float cnoise(vec3 P){
    vec3 Pi0 = floor(P); // Integer part for indexing
    vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
    Pi0 = mod(Pi0, 289.0);
    Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P); // Fractional part for interpolation
    vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;
  
    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);
  
    vec4 gx0 = ixy0 / 7.0;
    vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);
  
    vec4 gx1 = ixy1 / 7.0;
    vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);
  
    vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
    vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
    vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
    vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
    vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
    vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
    vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
    vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
  
    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x;
    g010 *= norm0.y;
    g100 *= norm0.z;
    g110 *= norm0.w;
    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x;
    g011 *= norm1.y;
    g101 *= norm1.z;
    g111 *= norm1.w;
  
    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);
  
    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x); 
    return 2.2 * n_xyz;
  }

  void main() {
    vec2 st = gl_FragCoord.xy/vec2(0.1920, 0.1080);
    vec4 col = vec4(0,0,0,1);
    float color = cnoise(vec3(st.x, st.y, time)) * 0.5 + 0.5;
    if(color > 0.5) {
      color = 0.8;
    } else {
      color = 0.2;
    }
    gl_FragColor = col*(color);
  }`

  ngOnInit() {
    this.audioContext = new AudioContext();
    this.frameCount = this.audioContext.sampleRate;
    this.noiseBuf = this.createWhiteNoise();
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0;
    this.gainNode.connect(this.audioContext.destination);
    this.doit();

    let canvas = this.glCanvas.nativeElement;
    this.gl = canvas.getContext("webgl");
    if (!this.gl) {
      alert("Unable to initialize WebGL. Your browser or machine may not support it.");
      return;
    }

    const vertshader = this.createShader(this.gl, this.vertexShader, this.gl.VERTEX_SHADER);
    const fragshader = this.createShader(this.gl, this.fragShader, this.gl.FRAGMENT_SHADER);
    const program = this.createProgram(this.gl, vertshader, fragshader);
    const pos = this.gl.getAttribLocation(program, 'a_position');
    const buf = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buf);

    const positions = [
      -1, -1,
      1, -1,
      1, 1,
      -1, 1,
    ];

    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);

    this.gl.viewport(0,0, this.gl.canvas.width, this.gl.canvas.height);
    this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.gl.useProgram(program);
    this.gl.enableVertexAttribArray(pos);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buf);

    const size = 2;
    const type = this.gl.FLOAT;
    const normalize = false;
    const stride = 0;
    const offset = 0;
    this.gl.vertexAttribPointer(pos, size, type, normalize, stride, offset);
    
    const primitiveType = this.gl.TRIANGLE_FAN;
    const offset2 = 0;
    const count = 4;
    

    setInterval(() => {
      this.resize(canvas);
      const location = this.gl.getUniformLocation(program, 'time');
      this.gl.uniform1f(location, new Date(Date.now()).getTime() - 1510000000000);
      this.gl.drawArrays(primitiveType, offset2, count);
    }, 1000/24);
  }

  private resize(canvas) {
    const divFactor = 2;

    // Lookup the size the browser is displaying the canvas.
    var displayWidth  = canvas.clientWidth / divFactor;
    var displayHeight = canvas.clientHeight / divFactor;
   
    // Check if the canvas is not the same size.
    if (canvas.width / divFactor  != displayWidth ||
        canvas.height / divFactor != displayHeight) {
   
      // Make the canvas the same size
      canvas.width  = displayWidth;
      canvas.height = displayHeight;
    }

    this.gl.viewport(0,0, this.gl.canvas.width, this.gl.canvas.height);
  }

  private createShader(gl: WebGLRenderingContext, source: string, type: number): WebGLShader {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (success) {
      return shader;
    }

    console.log(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
  }

  private createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
      return program;
    }

    console.log(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
  }

  playNoise() {
    this.gainNode.gain.value = this.playingSound ? 0 : 0.1;
    this.playingSound = !this.playingSound;
  }

  private doit() {
    let source = this.audioContext.createBufferSource();
    source.buffer = this.noiseBuf;
    source.connect(this.gainNode);
    source.start();
    source.onended = () => {
      this.doit();
    }
    this.noiseBuf = this.createWhiteNoise();
  }

  createWhiteNoise(): AudioBuffer {
    const buf = this.audioContext.createBuffer(1, this.frameCount, this.audioContext.sampleRate);
    
    const channelBuf = buf.getChannelData(0);
    for (let i = 0; i < this.frameCount; i++) {
      channelBuf[i] = Math.random() * 2 - 1;
    }

    return buf;
  }
}
