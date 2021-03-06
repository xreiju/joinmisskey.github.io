const syntaxHighliterUrl = 'https://raw.githubusercontent.com/syuilo/misskey/master/src/mfm/parse/core/syntax-highlighter.ts'

// npm require
const gulp = require('gulp')
const extend = require('extend')
const fs = require('fs')
const util = require('util')
const promisify = util.promisify
const path = require('path')
const del = require('del')
const crypto = require('crypto')
const workboxBuild = require('workbox-build')
const minimist = require('minimist')
const pump = require('pump')

// const request = require('request')
const fontawesome = require("@fortawesome/fontawesome-svg-core")
fontawesome.library.add(require("@fortawesome/free-solid-svg-icons").fas, require("@fortawesome/free-regular-svg-icons").far, require("@fortawesome/free-brands-svg-icons").fab)
$ = require('gulp-load-plugins')()

// const exec = require('child_process').exec
// const join = path.join
// const moment = require('moment')
// const numeral = require('numeral')
// const inquirer = require('inquirer')
// const summaly = require('summaly').default

// promisify

const writeFile = promisify(fs.writeFile)
const readFile = promisify(fs.readFile)
// const get = promisify(request.get)

// arg
const argv = minimist(process.argv.slice(2))

// debug
const DEBUG = !!( argv._.indexOf('debug') > -1 || argv.debug )

function existFile(file) {
    try {
        fs.statSync(file)
        return true
    } catch(e) {
        if(e.code === 'ENOENT') return false
    }
}

// グローバル気味変数
let package = require('./package.json')
let messages = require('./.config/messages.json')
let site = extend(true,
    require('./.config/default.json'),
    require('./.config/lang.json'),
    require('./.config/images.json')
)
const keys = {} /* require('./.config/keys.json') */
const workboxSWSrcPath = require.resolve('workbox-sw')
let theme_pug = {}
theme_pug.script = fs.readFileSync('theme/pug/includes/_script.pug', {encoding: 'utf8'})
theme_pug.mixin = fs.readFileSync('theme/pug/includes/_mixins.pug', {encoding: 'utf8'})

let instances = {}

let temp_dir = 'theme/pug/temp/' // 末尾のスラッシュ必要

let src = {
   'everypug': ['theme/pug/**/*.pug','./.temp/**/*.pug'],
   'json': ['config/**/*.json'],
   'js': ['theme/js/**/*.js'],
   'styl_all': ['theme/styl/**/*.styl'],
   'static': ['theme/static/**'],
   'files': ['files/**/*'],
   'filesPrebuilt': ['filesPrebuilt/**/*'],
   'everystyl': ['theme/styl/**/*.styl'],
   'pages': path.join(site.pages_src.path, site.pages_src.src)
}

let dests = {
    'root': './dist/docs',
    'everything': './dist/docs/**',
    'info': './dist/docs/info.json'
}

/*function faSvg(icon, prefix, option){
    return fontawesome.icon({ prefix: ( prefix || "fas" ), iconName: icon },option).html[0]
}*/

/*
function escape_html(val) {
    if(typeof val !== 'string'){ return val }
    return val.replace(/[&'`"<>]/g, function(match) {
        return {
            '&': '&amp;',
            "'": '&#x27;',
            '`': '&#x60;',
            '"': '&quot;',
            '<': '&lt;',
            '>': '&gt;'
        }[match]
    })
}
*/
function getHash(data, a, b, c){
    const hashv = crypto.createHash(a)
    hashv.update(data, b)
    return hashv.digest(c)
}

async function register_pages(){
    let promises = []
    const srcs = require('glob').sync(src.pages)
    for(p = 0; p < srcs.length; p++){
        promises.push(
            doit(srcs[p], p, srcs, path.parse(site.pages_src.path))
        )
    }
    let result = await Promise.all(promises)
    result = result.filter( (el, i, arr) => !!el )
    return result
    async function doit(val, i, arr, srcpath){
        let page = {}
        const src = path.parse(val)

        if(src.name == "sidebar") return false   // - - - - - - - -  名前がsidebarのとき弾く */ 
        let subdir = src.dir.replace(srcpath.base, '')
        if(subdir.indexOf('/') == 0) subdir = subdir.slice(1)
        if ( !subdir ) subdir = ''

        let file = fs.readFileSync( val, 'utf-8' )
        page = extend(true,page,require('front-matter')(file))

        page.meta = {}
        page.meta.src = src
        page.meta.src.subdir = subdir

        let md5hash = crypto.createHash('md5')
        md5hash.update(file, 'binary')
        page.meta.md5 = getHash(file, 'md5', 'binary', 'hex')
        page.meta.sha384 = getHash(file, 'sha384', 'binary', 'base64')
        page.stats = fs.statSync( val )

        page.body = page.body.replace(/\r\n?/gi,"\n") // 文字コードをLFにそろえる
        delete page.frontmatter

        page.attributes.title = page.attributes.title || page.meta.srcname || null
        page.attributes.description = page.attributes.description || ""
        page.meta.mtime = (new Date(page.attributes.mtime || page.attributes.date || page.stats.mtime)).toJSON()
        page.meta.birthtime = (new Date(page.attributes.birthtime || page.stats.birthtime)).toJSON()

        page.meta.thumbnail = page.attributes.thumbnail ? path.parse(page.attributes.thumbnail) : null

        if( page.attributes.permalink === undefined || page.attributes.permalink === null ) {
            if(subdir != '') page.meta.permalink = `/${subdir}/${page.meta.src.name}`
            else page.meta.permalink = `/${page.meta.src.name}`
        } else { page.meta.permalink = page.attributes.permalink }
        if( page.attributes.layout === undefined || page.attributes.layout === null ) page.attributes.layout = 'default'
        if( page.attributes.published === undefined || page.attributes.published === null ) page.attributes.published = true
        if( page.attributes.draft === undefined || page.attributes.draft === null ) page.attributes.draft = false
        if( page.meta.permalink.indexOf('/') != 0 ) page.meta.permalink = '/' + page.meta.permalink
        if( page.meta.permalink.lastIndexOf('index') == page.meta.permalink.length - 5 && page.meta.permalink.indexOf('index') != -1 ) page.meta.permalink = page.meta.permalink.slice(0,-5)
        else if( page.meta.permalink.lastIndexOf('/') != page.meta.permalink.length - 1 ) page.meta.permalink = page.meta.permalink + '/'
        if( typeof page.attributes.categories === 'string' ) page.attributes.categories = page.attributes.categories.split(' ')
        if( typeof page.attributes.tags === 'string' ) page.attributes.tags = page.attributes.tags.split(' ')
        if( typeof page.attributes.category === 'string' ){
            page.attributes.categories = page.attributes.category.split(' ')
            delete page.attributes.category
        }
        if( typeof page.attributes.tag === 'string' ){
            page.attributes.tags = page.attributes.tag.split(' ')
            delete page.attributes.tag
        }
        return page
    }
}

function register_manifest(){
    let icons = []
    for (let i = 0 ; i < site.icons.length ; i++) {
        let icon = site.icons[i]
        icon.src = site.url.path + icon.path
        icons.push(icon)
    }
    let manifest = {
        'name': site.name,
        'short_name': site.short_name,
        'icons': icons,
        'start_url': site.url.path,
        'theme_color': site.theme_color.primary,
        'background_color': site.theme_color.primary
    }
    manifest = extend(true,manifest,site.manifest)
    return manifest
}

let manifest = {}
let pages = []

gulp.task('register', async cb => {
    manifest = {}
    pages = []
    ytthumbs = []
    instances = {}

    for(locale of site.locales){
        try {
            instances[locale] = require('js-yaml').safeLoad(fs.readFileSync(`./instances/${locale}.yml`))
        } catch(e) {
            instances[locale] = []
        }
    }
    manifest = register_manifest()
    pages = await register_pages()
    theme_pug.script = fs.readFileSync('theme/pug/includes/_script.pug', {encoding: 'utf8'})
    theme_pug.mixin = fs.readFileSync('theme/pug/includes/_mixins.pug', {encoding: 'utf8'})
    cb()
})


gulp.task('config', (cb) => {
    let resultObj = { options: '' }
    resultObj.timestamp = (new Date()).toJSON()
    resultObj = extend(true,resultObj, { 'pages' : pages })
    require('mkdirp').sync(path.parse(dests.info).dir)
    return writeFile( dests.info, JSON.stringify( resultObj ))
    .then(
        () => { $.util.log($.util.colors.green(`✔ info.json`)) },
        (err) => { $.util.log($.util.colors.red(`✖ info.json`)); $.util.log(err) }
    )
})

gulp.task('pug', async (cb) => {
    require('mkdirp').sync(temp_dir)
    let stream = require('merge2')()
    let ampcss = ""
    const URL = require('url')
    const urlPrefix = `${site.url.scheme}://${site.url.host}${site.url.path}`
    const base = {
        site: site,
        keys: keys,
        package: package,
        pages: pages,
        manifest: manifest,
        messages: messages,
        require: require,
        theme_pug: theme_pug,
        instances: instances,
        urlPrefix: urlPrefix,
        DEBUG: DEBUG
    }

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i]
        const url = URL.parse(`${urlPrefix}${page.meta.permalink}`)
        const data = extend(false, {
                page: page,
                url: url
            }, base)
        const pugoptions = {
            data: data,
            filters: require('./pugfilters.js')
        }

        let layout = page.attributes.layout
        let template = '', amptemplate = ''
        if(existFile(`theme/pug/templates/${layout}.pug`)) template += `theme/pug/templates/${layout}.pug`
        else if(existFile(`theme/pug/templates/${site.default.template}.pug`)) template += `theme/pug/templates/${site.default.template}.pug`
        else throw Error('default.pugが見つかりませんでした。')
        stream.add(
            gulp.src(template)
                .pipe($.pug(pugoptions))
                .pipe($.rename(`${page.meta.permalink}index.html`))
                .pipe(gulp.dest( dests.root ))
                .on('end',() => {
                    $.util.log($.util.colors.green(`✔ ${page.meta.permalink}`))
                })
                .on('error', (err) => {
                    $.util.log($.util.colors.red(`✖ ${page.meta.permalink}`))
                    $.util.log($.util.colors.red(err))
                })
        )
        /*
         *                            AMP処理部
         *                                                                  */

        if(page.attributes.amp){
            if(ampcss == ""){
                try {
                    const cleanCss = require("clean-css")
                    ampcss += '/*Based on Bootstrap v4.1.3 (https://getbootstrap.com)|Copyright 2011-2018 The Bootstrap Authors|Copyright 2011-2018 Twitter, Inc.|Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)*/\n'
                    ampcss += (await promisify(require("node-sass").render)({file: 'theme/styl/amp_main.sass'})).css.toString()
                    ampcss += '\n'
                    ampcss += fontawesome.dom.css()
                    ampcss += '\n'
                    ampcss = new cleanCss().minify(ampcss).styles.replace(/!important/g,"").replace(/@charset "UTF-8";/g,"").replace(/@-ms-viewport{width:device-width}/g,"")

                    $.util.log(`making amp css: ${Buffer.byteLength(ampcss)}Byte`)
                } catch(e) {
                    $.util.log($.util.colors.red('making amp css failed'))
                    $.util.log($.util.colors.red(e))
                    ampcss = "/* oops */"
                }
            }

            if(existFile(`theme/pug/templates/amp_${layout}.pug`)) amptemplate += `theme/pug/templates/amp_${layout}.pug`
            else if(existFile(`theme/pug/templates/amp_${site.default.template}.pug`)) amptemplate += `theme/pug/templates/amp_${site.default.template}.pug`
            else throw Error('amp_default.pugが見つかりませんでした。')

            const newoptions = extend(false, { data: { isAmp: true, ampcss: ampcss }}, pugoptions)

            stream.add(
                gulp.src(amptemplate)
                    .pipe($.pug(newoptions))
                    .pipe($.rename(`${page.meta.permalink}amp.html`))
                    .pipe(gulp.dest( dests.root ))
                    .on('end',() => {
                        $.util.log($.util.colors.green(`✔ ${page.meta.permalink}amp.html`))
                    })
                    .on('error', (err) => {
                        $.util.log($.util.colors.red(`✖ ${page.meta.permalink}`))
                        $.util.log($.util.colors.red(err))
                    })
            )
        }
    }
    return stream.on('end', cb)
})

gulp.task('css', (cb) => {
    pump([
        gulp.src('theme/styl/main.sass'),
        $.sass( { sourceMap: true, outputStyle: 'compressed' } ),
        $.autoprefixer( { browsers: 'last 3 versions' } ),
        $.rename('style.min.css'),
        gulp.dest(dests.root + '/assets')
    ], (e) => {
        if(e) $.util.log($.util.colors.red("Error(css)\n" + e))
        else $.util.log($.util.colors.green(`✔ assets/style.min.css`))
        cb()
    })
})

gulp.task('fa-css', (cb) => {
    pump([
        gulp.src('node_modules/@fortawesome/fontawesome-svg-core/styles.css'),
        $.cleanCss(),
        $.rename('fontawesome.min.css'),
        gulp.dest(dests.root + '/assets')
    ], (e) => {
        if(e) $.util.log($.util.colors.red("Error(fa-css)\n" + e))
        else $.util.log($.util.colors.green(`✔ assets/style.min.css`))
        cb()
    })
})
gulp.task('js', (cb) => {
    pump([
        gulp.src('theme/js/main.js'),
        $.webpack(),
        $.babel({presets: ['babel-preset-env'], plugins: ['transform-remove-strict-mode'], compact: false}),
        $.rename('main.js'),
        gulp.dest(dests.root + '/assets'),
        $.uglify(),
        $.rename('main.min.js'),
        gulp.dest(dests.root + '/assets')
    ], (e) => {
        if(e) { $.util.log($.util.colors.red("Error(js)\n" + e)) }
        else {
            $.util.log($.util.colors.green(`✔ assets/main.js`))
            $.util.log($.util.colors.green(`✔ assets/main.min.js`))
        }
        cb()
    })
})

gulp.task('copy-docs', (cb) => {
    pump([
        gulp.src('dist/docs/**/*'),
        gulp.dest('./docs')
    ], cb)
})
gulp.task('copy-theme-static', (cb) => {
    pump([
        gulp.src('theme/static/**/*'),
        gulp.dest(dests.root)
    ], cb)
})
gulp.task('copy-bootstrapjs', (cb) => {
    pump([
        gulp.src('node_modules/bootstrap/dist/js/**'),
        gulp.dest(dests.root + '/assets')
    ], cb)
})
gulp.task('copy-animatecss', (cb) => {
    pump([
        gulp.src('node_modules/animate.css/*.css'),
        gulp.dest(dests.root + '/assets')
    ], cb)
})
gulp.task('copy-pjax', (cb) => {
    pump([
        gulp.src('node_modules/pjax-api/dist/**'),
        gulp.dest(dests.root + '/assets')
    ], cb)
})
gulp.task('copy-prebuildFiles', (cb) => {
    pump([
        gulp.src('dist/files/**/*'),
        gulp.dest(dests.root + '/files')
    ], cb)
})
gulp.task('copy-files', (cb) => {
    pump([
        gulp.src(src.files),
        gulp.dest(dests.root + '/files')
    ], cb)
})
gulp.task('copy-f404', (cb) => {
    pump([
        gulp.src('dist/docs/404/index.html'),
        $.rename('404.html'),
        gulp.dest('./docs')
    ], cb)
})

function images_base(){
    const images_allFalse = {
        optipng: false,
        pngquant: false,
        zopflipng: false,
        jpegRecompress: false,
        mozjpeg: false,
        guetzli: false,
        gifsicle: false,
        svgo: false
    }
    return site.images.files.all.image ? extend(true,images_allFalse,site.images.files.all.image) : images_allFalse
}
gulp.task('image-prebuildFiles', () => {
    const sizes = site.images.files.sizes
    const stream = gulp.src('files/**/*.{png,jpg,jpeg}')
    const stream2 = require('merge2')()
    for(i = 0; i < sizes.length; i++){
        stream2.add(
            stream
            .pipe($.imageResize(sizes[i].resize || {}))
            .pipe($.image(sizes[i].image ? extend(true, images_base(), sizes[i].image) : images_allFalse))
            .pipe($.rename(sizes[i].rename || {}))
            .pipe(gulp.dest('dist/files'))
        )
    }
    stream2.add(
        gulp.src('files/**/*.{gif,svg}')
        .pipe($.image(extend(true, images_base(), {
            "gifsicle": true,
            "svgo": true
        })))
        .pipe(gulp.dest('dist/files'))
    )

    return stream2
})

gulp.task('image', () => {
    if (!argv.i) new Error('ファイル/フォルダ名が指定されていません。 -i <path>を付けて指定してください。')
    const parsed = path.parse(argv.i)
    const sizes = site.images.files.sizes
    const stream2 = require('merge2')()
    const date = new Date()
    let gifsvg, others
    const dirname = `${date.getFullYear()}/${("0" + (date.getMonth() + 1)).slice(-2)}`
    $.util.log(`image will be saved as "files/${dirname}/${parsed.name}${parsed.ext}"`)
    if(parsed.ext == "") {
        gifsvg = gulp.src(argv.i + '/**/*.{gif,svg}')
        others = gulp.src(argv.i + '/**/*.{png,jpg,jpeg}')
    } else if(parsed.ext == "gif" || parsed.ext == "svg") {
        gifsvg = gulp.src(argv.i)
    } else {
        others = gulp.src(argv.i)
    }
    if(gifsvg){
        stream2.add(
            gifsvg
            .pipe($.image(extend(true, images_base(), {
                "gifsicle": true,
                "svgo": true
            })))
            .pipe($.rename({dirname: dirname} || {}))
            .pipe(gulp.dest('dist/files/images/imports'))
        )
        stream2.add(
            gifsvg
            .pipe($.rename({dirname: dirname} || {}))
            .pipe(gulp.dest('files/images/imports'))
        )
    }
    if(others){
        for(i = 0; i < sizes.length; i++){
            stream2.add(
                others
                .pipe($.imageResize(sizes[i].resize || {}))
                .pipe($.image(sizes[i].image ? extend(true, images_base(), sizes[i].image) : images_allFalse))
                .pipe($.rename(sizes[i].rename || {}))
                .pipe($.rename({dirname: dirname} || {}))
                .pipe(gulp.dest('dist/files/images/imports'))
            )
        }
        stream2.add(
            others
            .pipe($.rename({dirname: dirname} || {}))
            .pipe(gulp.dest('files/images/imports'))
        )
    }

    return stream2
})

// todo: download and build highlighter
gulp.task('download-highlighter', (cb) => {
    cb()
})

gulp.task('clean-temp', (cb) => { del(temp_dir+'**/*').then(cb()) } )
gulp.task('clean-docs', (cb) => { del(['docs/**/*', '!docs/.git']).then(cb()) } )
gulp.task('clean-dist-docs', (cb) => { del('dist/docs/**/*').then(cb()) } )
gulp.task('clean-dist-files', (cb) => { del('dist/files/**/*').then(cb()) } )

gulp.task( 'debug-override', (cb) => {
    site = extend(true,site,require('./.config/debug_override.json'))
    cb()
})

gulp.task('make-sw', (cb) => {
    // twbs/bootstrapより借用

    const buildPrefix = 'dist/docs/'
    const config = {
        'globDirectory': './dist/docs/',
        'globPatterns': [
          '**/*.{css,js,json,woff2}'
        ],
        'globIgnores': [],
        'swSrc': 'theme/js/sw.js',
        'swDest': 'dist/docs/service_worker.js'
     }

    const wbFileName = path.basename(workboxSWSrcPath)
    const workboxSWDestDir = `${buildPrefix}/`
    const workboxSWDestPath = `${workboxSWDestDir}${wbFileName}`
    const workboxSWWrite = `${site.url.path}/${wbFileName}`
    const workboxSWSrcMapPath = `${workboxSWSrcPath}.map`
    const workboxSWDestMapPath = `${workboxSWDestPath}.map`

    fs.createReadStream(workboxSWSrcPath).pipe(fs.createWriteStream(workboxSWDestPath))
    fs.createReadStream(workboxSWSrcMapPath).pipe(fs.createWriteStream(workboxSWDestMapPath))
    /*
    const updateUrl = (manifestEntries) => manifestEntries.map((entry) => {
    if (entry.url.startsWith(buildPrefix)) {
        const regex = new RegExp(buildPrefix, 'g')
        entry.url = entry.url.replace(regex, '')
    }
    return entry
    })

    config.manifestTransforms = [updateUrl]
    */
    workboxBuild.injectManifest(config).then(() => {
        const wbSwRegex = /{path}/g
        fs.readFile(config.swDest, 'utf8', (err, data) => {
            if (err) {
                throw err
            }
            const swFileContents = data.replace(wbSwRegex, workboxSWWrite)
            fs.writeFile(config.swDest, swFileContents, () => {
                $.util.log($.util.colors.green(`✔ service_worker.js`)); cb()
                cb()
            })
        })
    })
})

gulp.task('make-manifest', (cb) => {
    return writeFile( `dist/docs/manifest.json`, JSON.stringify(manifest))
    .then(
        () => { $.util.log($.util.colors.green(`✔ manifest.json`)) },
        (err) => { $.util.log($.util.colors.red(`✖ manifest.json`)); $.util.log(err) }
    )
})

const browserconfigXml = () => {
    return `<?xml version='1.0' encoding='utf-8'?>
    <browserconfig>
      <msapplication>
        <tile>
          <square70x70logo src='${site.url.path}${site.mstiles.s70x70.path}'/>
          <square144x144logo src='${site.url.path}${site.mstiles.s144x144.path}'/>
          <square150x150logo src='${site.url.path}${site.mstiles.s150x150.path}'/>
          <square310x310logo src='${site.url.path}${site.mstiles.s310x310.path}'/>
          <wide310x150logo src='${site.url.path}${site.mstiles.w310x150.path}'/>
          <TileColor>${site.theme_color.secondary}</TileColor>
        </tile>
      </msapplication>
    </browserconfig>`
}

gulp.task('make-browserconfig', (cb) => {
    fs.writeFile( `dist/docs/browserconfig.xml`, browserconfigXml, () => {
        $.util.log($.util.colors.green(`✔ browserconfig.xml`)); cb()
    })
})


gulp.task('notify-failure', () => {
    const options = {
        uri: process.env.DISCORD_WEBHOOK_URL,
        headers: {
            "Content-type": "application/json"
        },
        json: { content: `🚨Travis CI Build Failed: #${process.env.TRAVIS_JOB_NUMBER} https://travis-ci.org/vytfs/wiki/` }
    }
    return promisify(request.post)(options)
})

function wait4(cb, sec){
    let interval = null
    process.stdout.write($.util.colors.green(` ${sec} ██████    \r`))
    function waiti(){
        sec--
        if( sec < 0 && interval != null ){
            process.stdout.write(`\r`)
            cb()
            clearInterval(interval)
        }
        else if ( sec == 0 ) process.stdout.write($.util.colors.red(`\r ${sec}              \r`))
        else if ( sec == 1 ) process.stdout.write($.util.colors.red(`\r ${sec}  █            \r`))
        else if ( sec == 2 ) process.stdout.write($.util.colors.red(`\r ${sec}  ██          \r`))
        else if ( sec == 3 ) process.stdout.write($.util.colors.red(`\r ${sec}  ███        \r`))
        else if ( sec == 4 ) process.stdout.write($.util.colors.yellow(`\r ${sec}  ████      \r`))
        else if ( sec == 5 ) process.stdout.write($.util.colors.yellow(`\r ${sec}  █████    \r`))
        else process.stdout.write($.util.colors.green(`\r ${sec}  ██████    `))
    }
    interval = setInterval(waiti, 1000)
}

gulp.task('wait-5sec', (cb) => {
    wait4(cb, 5)
})

gulp.task('wait-10sec', (cb) => {
    wait4(cb, 10)
})

gulp.task('last',
    gulp.series(
        'clean-docs',
        'copy-f404',
        'copy-docs',
        'clean-dist-docs',
        (cb) => { cb() }
    )
)

gulp.task('copy-publish',
    gulp.series(
        'copy-files',
        'copy-prebuildFiles',
        'copy-theme-static',
        'copy-pjax',
        'copy-bootstrapjs',
        'copy-animatecss',
        (cb) => { cb() }
    )
)
gulp.task('make-subfiles',
    gulp.series(
        gulp.parallel(
            'make-manifest',
            'make-browserconfig'
        ),
        (cb) => { cb() }
    )
)

gulp.task('core',
    gulp.series(
        gulp.parallel('js', 'css', 'fa-css', 'pug'),
        gulp.parallel('clean-temp', 'copy-publish', 'make-subfiles'),
        'make-sw', 'last',
        (cb) => { cb() }
    )
)

gulp.task('default',
    gulp.series(
        'register',
        'config',
        'core',
        (cb) => { cb() }
    )
)

gulp.task('prebuild-files',
    gulp.series(
        'clean-dist-files',
        'image-prebuildFiles',
        (cb) => { cb() } 
    )
)

gulp.task('core-with-pf',
    gulp.series(
        gulp.parallel('js', 'css', 'fa-css', 'pug', 'prebuild-files'),
        gulp.parallel('clean-temp', 'copy-publish', 'make-subfiles'),
        'make-sw', 'last',
        (cb) => { cb() }
    )
)

gulp.task('travis_ci',
    gulp.series(
        'register',
        'prebuild-files',
        'default',
        (cb) => { cb() }
    )
)

gulp.task('watcher',
    gulp.series(
        'wait-5sec', 'register', 'config', 'debug-override',
        (cb) => { cb() } 
    )
)

gulp.task('watch', (cb) => {
    gulp.watch(['theme/**/*', `!${temp_dir}**/*`, 'pages/**/*', './.config/**/*', './scripts/**/*'], gulp.series('watcher', 'server',(cb)=>{cb()}))
    gulp.watch(['files/**/*', './.config/**/*'], gulp.series('watcher',(cb)=>{cb()}))
})

gulp.task('connect', () => {
    $.connect.server({
        port: '8080',
        root: 'docs',
        livereload: true
    })
})

gulp.task('server',
    gulp.series(
        'register',
        'config', 'debug-override',
        'core',
        (cb) => { cb() } 
    )
)

gulp.task('local-server',
    gulp.series(
        'register',
        'config', 'debug-override',
        'core',
        gulp.parallel('connect', 'watch'),
        (cb) => { cb() } 
    )
)