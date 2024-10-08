//lazy code
//jpeg compressing audio

const Jimp = require('jimp')
const fs = require('fs')
const cp = require('child_process')
const exec = require('util').promisify(cp.exec)

if (!process.argv[2]) {
    console.log('usage: node . (filePath) (quality 1-100, higher is better)')
    return process.exit(0);
}

let filePath = process.argv[2]
let quality = Number(process.argv[3] || 100)
let safeFilePath = `"${filePath.replaceAll('"', '\\"')}"`
let tempDirPath = `./.temp${Date.now()}`
fs.rmSync('./output.flac', { force: true })
fs.rmSync('./output.jpeg', { force: true })

async function main() {
    console.log('checking for ffmpeg')
    try {
        await exec('ffmpeg -version')
        await exec('ffprobe -version')
    } catch {
        console.log('ffmpeg/ffprobe not found in path')
        return process.exit(1);
    }

    console.log('checking for imagemagick convert')
    try {
        await exec('convert -version')
    } catch {
        console.log('convert not found in path')
        return process.exit(1);
    }

    fs.mkdirSync(tempDirPath)
    console.log('probing audio file')

    let probe = (await exec(`ffprobe ${safeFilePath}`)).stderr //why is the output in stderr
    let streamLine = probe.split('\n').find(l => l.includes(' Audio: ')) //i hate this
    let streamLineParts = streamLine.split(' Audio: ')[1].split(', ') //i hate this even more

    let channels = streamLineParts.includes('stereo') ? 2 : 1
    let frequency = Number(streamLineParts.find(p => p.includes('Hz')).split(' ')[0])

    console.log('converting audio to raw pcm')
    await exec(`ffmpeg -i ${safeFilePath} -f u8 -acodec pcm_u8 ${tempDirPath}/output.raw`)

    console.log('converting raw pcm to bmp image')

    let pcm = fs.readFileSync(`${tempDirPath}/output.raw`)

    let size = Math.ceil(Math.sqrt(Math.ceil(pcm.length / 3)))
    let remainder = size % 8;
    if (remainder > 0) size += (8 - remainder) //magically fixes clicking

    let width = size;
    let height = size;

    let image = new Jimp.Jimp({ width, height })
    let i = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let red = pcm[i++]
            let green = pcm[i++]
            let blue = pcm[i++]
            let color = Jimp.rgbaToInt(red || 0, green || 0, blue || 0, 255)
            image.setPixelColor(color, x, y)
        }
    }

    await image.write(`${tempDirPath}/output.bmp`) //for some reason, writing directly as a jpeg breaks node

    console.log(`converting bmp image to jpeg at ${quality} quality`)
    await exec(`convert ${tempDirPath}/output.bmp -quality ${quality} ./output.jpeg`)

    console.log('converting jpeg image to raw rgb')
    await exec(`convert ./output.jpeg ${tempDirPath}/output.rgb`)

    console.log('reading raw rgb image as raw pcm audio, and converting to flac')
    await exec(`ffmpeg -f u8 -ar ${frequency} -ac ${channels} -i ${tempDirPath}/output.rgb output.flac`)

    console.log('done, audio file is at ./output.flac and jpeg file is at ./output.jpeg')
    fs.rmSync(tempDirPath, { recursive: true, force: true })
}

main()