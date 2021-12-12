/**
 * Animated WebP Encoder
 *
 * @file Creates an Animated WebP from an array of WebP blobs.
 * @author Valentin Schmidt
 * @version 0.2
 *
 * -- MIT License
 *
 * Copyright (c) 2021 Valentin Schmidt
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
 * PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
 * FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

'use strict';

const MAGIC_VP8X = 0x56503858; // "VPX8"
const MAGIC_ICCP = 0x49434350; // "ICCP"

(function(root) {

	var AWEBPEncoder = function(w, h, fps) {
		this._width = w;
		this._height = h;
		this._fps = fps;
	}

	/**
	 * Creates Animated WebP from array of WebP blobs
	 * @param {array} frames - Array of WebPs as blobs
	 * @param {function} cb - A callback that receives the final Animated WebP blob
	 */
	AWEBPEncoder.prototype.createFromBlobs = function(frame_blobs, cb) {
		if (frame_blobs.length == 0) {
			throw('Empty blob array');
		} else if (frame_blobs[0].type != 'image/webp') {
			throw('Blob has wrong mimetype');
		}

		if (console.time) console.time('Encoding AWEBP');
		let chunks = [];

		let size = 0,
			frame_num = 0,
			frame_data,
			frame_view,
			offset_image;

		// WebP file header (8+4 bytes)
		let header = new Uint8Array([0x52,0x49,0x46,0x46,  0,0,0,0,  0x57,0x45,0x42,0x50]); // RIFF...WEBP
		chunks.push(header.buffer);
		size += 12;

		//######################################
		// VP8X chunk (8+10 bytes)
		//######################################
		let VP8X = new Uint8Array([0x56,0x50,0x38,0x58,  0x0A,0,0,0,  2,0,0,0, 0,0,0, 0,0,0]);
		let VP8X_view = new DataView(VP8X.buffer);
		VP8X_view.setUint16(12, this._width-1, true); // actually 24 bit, but max. 65536 px width should be fine
		VP8X_view.setUint16(15, this._height-1, true); // actually 24 bit, but max. 65536 px height should be fine
		chunks.push(VP8X.buffer);
		size += 18;

		//######################################
		// ANIM chunk (8+6 bytes)
		//######################################
		let ANIM = new Uint8Array([0x41,0x4E,0x49,0x4D,  6,0,0,0,  0,0,0,0,0,0]);
		chunks.push(ANIM.buffer);
		size += 14;

		let reader = new FileReader();
		reader.onload = (e) => {
			frame_data = new Uint8Array(reader.result);
			frame_view = new DataView(frame_data.buffer);
			if (frame_view.getUint32(12) == MAGIC_VP8X) // Extended File Format (newer Chrome versions)
				if (frame_view.getUint32(30) == MAGIC_ICCP)
					offset_image = 30 + 8 + frame_view.getUint32(34, true);
				else
					offset_image = 30;
			else // Simple File Format (older Chrome versions)
				offset_image = 12;

			//######################################
			// ANMF chunk
			//######################################
			let ANMF = new Uint8Array(8 + 16); // 24 bytes
			let ANMF_view = new DataView(ANMF.buffer);
			this._writeStr(ANMF, 0, 'ANMF');
			ANMF_view.setUint32(4, 16 + reader.result.byteLength - offset_image, true);
			ANMF_view.setUint32(8, 0, true); //24 bit
			ANMF_view.setUint32(11, 0, true); //24 bit
			ANMF_view.setUint32(14, this._width-1, true); //24 bit
			ANMF_view.setUint32(17, this._height-1, true); //24 bit
			ANMF_view.setUint32(20, 1000/this._fps, true); //24 bit
			ANMF_view.setUint8(23, 3);
			chunks.push(ANMF.buffer);
			size += 24;

			// add actual image data
			chunks.push(reader.result.slice(offset_image));
			size += (reader.result.byteLength - offset_image);

			frame_num++;

			if (frame_num < frame_blobs.length) {
				// handle next frame
				reader.readAsArrayBuffer(frame_blobs[frame_num]);
			} else {
				// update total size
				let header_view = new DataView(chunks[0]);
				header_view.setUint32(4, size-8, true);

				if (console.timeEnd) console.timeEnd('Encoding AWEBP');
				this._blob = new Blob(chunks, {type: 'image/webp'});
				cb(this._blob);
			}
		};

		// handle first frame
		reader.readAsArrayBuffer(frame_blobs[0]);
	};

	/**
	 * Utility, saves Animated WebP blob as local file
	 * @param {string} [filename=animation.webp]
	 */
	AWEBPEncoder.prototype.saveAsFile = function(filename) {
		if (!this._blob) {
			throw('No blob was generated');
		}
		if (!filename) filename = 'animation.webp';
		var a = document.createElement('a');
		document.body.appendChild(a);
		a.style = 'display: none';
		var url = window.URL.createObjectURL(this._blob);
		a.href = url;
		a.download = filename;
		a.click();
		setTimeout(() => {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		}, 100);
	};

	/**
	 * Utility, uploads Animated WebP blob via ajax and HTTP POST
	 * @param {string} url
	 * @param {string} varName - POST var name for uploaded WebP file
	 * @param {object} postVars - additional POST vars, {} for none
	 * @param {function} cbLoaded
	 * @param {function} [cbProgress]
	 */
	AWEBPEncoder.prototype.upload =  function (url, varName, postVars, cbLoaded, cbProgress) {
		if (!this._blob) {
			throw('No blob was generated');
		}
		var fd = new FormData();
		fd.append(varName, this._blob);
		if (postVars) {
			for (var k in postVars) fd.append(k, postVars[k]);
		}
		var xhr = new XMLHttpRequest();
		xhr.addEventListener('load', function(e) {
			cbLoaded(true, e);
		}, false);
		xhr.addEventListener('error', function(e) {
			cbLoaded(false, e);
		}, false);
		if (xhr.upload && cbProgress) {
			xhr.upload.onprogress = function(e){
				if (e.lengthComputable) {
					cbProgress(e.loaded/e.total);
				}
			}
		}
		xhr.open('POST', url);
		xhr.send(fd);
	};

	/**
	 * @private
	 */
	AWEBPEncoder.prototype._writeStr = function(arr, pos, str) {
		for (var i=0;i<str.length;i++){
			arr[pos+i] = str.charCodeAt(i);
		}
	};

	// export
	root.AWEBPEncoder = AWEBPEncoder;

})(window);
