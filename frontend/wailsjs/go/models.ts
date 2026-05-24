export namespace backend {
	
	export class APILog {
	    id: number;
	    ts: number;
	    operation: string;
	    resourceId: string;
	    resourceTitle: string;
	    success: boolean;
	    errorMsg: string;
	    quotaCost: number;
	    durationMs: number;
	
	    static createFrom(source: any = {}) {
	        return new APILog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.ts = source["ts"];
	        this.operation = source["operation"];
	        this.resourceId = source["resourceId"];
	        this.resourceTitle = source["resourceTitle"];
	        this.success = source["success"];
	        this.errorMsg = source["errorMsg"];
	        this.quotaCost = source["quotaCost"];
	        this.durationMs = source["durationMs"];
	    }
	}
	export class FolderConfig {
	    recursive: boolean;
	    max_duration_secs: number;
	
	    static createFrom(source: any = {}) {
	        return new FolderConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.recursive = source["recursive"];
	        this.max_duration_secs = source["max_duration_secs"];
	    }
	}
	export class VideoMeta {
	    game: string;
	    youtubeTitle: string;
	    description: string;
	    privacy: string;
	    youtubeId?: string;
	    playlistId?: string;
	    episode: number;
	    durationSecs?: number;
	
	    static createFrom(source: any = {}) {
	        return new VideoMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.game = source["game"];
	        this.youtubeTitle = source["youtubeTitle"];
	        this.description = source["description"];
	        this.privacy = source["privacy"];
	        this.youtubeId = source["youtubeId"];
	        this.playlistId = source["playlistId"];
	        this.episode = source["episode"];
	        this.durationSecs = source["durationSecs"];
	    }
	}
	export class Config {
	    folders: string[];
	    youtube_client_id: string;
	    youtube_client_secret: string;
	    youtube_token_json?: string;
	    video_games: Record<string, string>;
	    video_metadata: Record<string, VideoMeta>;
	    folder_settings: Record<string, FolderConfig>;
	    watch_folder_enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folders = source["folders"];
	        this.youtube_client_id = source["youtube_client_id"];
	        this.youtube_client_secret = source["youtube_client_secret"];
	        this.youtube_token_json = source["youtube_token_json"];
	        this.video_games = source["video_games"];
	        this.video_metadata = this.convertValues(source["video_metadata"], VideoMeta, true);
	        this.folder_settings = this.convertValues(source["folder_settings"], FolderConfig, true);
	        this.watch_folder_enabled = source["watch_folder_enabled"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class VideoFile {
	    name: string;
	    path: string;
	    size: number;
	    modTime: number;
	    folder: string;
	    game: string;
	    youtubeTitle: string;
	    description: string;
	    privacy: string;
	    youtubeId?: string;
	    playlistId?: string;
	    playlistTitle?: string;
	    episode: number;
	
	    static createFrom(source: any = {}) {
	        return new VideoFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.size = source["size"];
	        this.modTime = source["modTime"];
	        this.folder = source["folder"];
	        this.game = source["game"];
	        this.youtubeTitle = source["youtubeTitle"];
	        this.description = source["description"];
	        this.privacy = source["privacy"];
	        this.youtubeId = source["youtubeId"];
	        this.playlistId = source["playlistId"];
	        this.playlistTitle = source["playlistTitle"];
	        this.episode = source["episode"];
	    }
	}
	
	export class YTPlaylist {
	    id: string;
	    title: string;
	    description: string;
	    videoCount: number;
	    thumbnailUrl: string;
	    publishedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new YTPlaylist(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.videoCount = source["videoCount"];
	        this.thumbnailUrl = source["thumbnailUrl"];
	        this.publishedAt = source["publishedAt"];
	    }
	}
	export class YTVideo {
	    id: string;
	    title: string;
	    description: string;
	    publishedAt: string;
	    thumbnailUrl: string;
	    viewCount: number;
	    likeCount: number;
	    duration: string;
	    privacy: string;
	    localFile?: string;
	    playlistTitle?: string;
	
	    static createFrom(source: any = {}) {
	        return new YTVideo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.description = source["description"];
	        this.publishedAt = source["publishedAt"];
	        this.thumbnailUrl = source["thumbnailUrl"];
	        this.viewCount = source["viewCount"];
	        this.likeCount = source["likeCount"];
	        this.duration = source["duration"];
	        this.privacy = source["privacy"];
	        this.localFile = source["localFile"];
	        this.playlistTitle = source["playlistTitle"];
	    }
	}
	export class YouTubeChannel {
	    id: string;
	    title: string;
	    thumbnail: string;
	
	    static createFrom(source: any = {}) {
	        return new YouTubeChannel(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.thumbnail = source["thumbnail"];
	    }
	}

}

