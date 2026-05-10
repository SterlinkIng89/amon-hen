export namespace main {
	
	export class Config {
	    folders: string[];
	    youtube_client_id: string;
	    youtube_client_secret: string;
	    youtube_token_json?: string;
	    video_games: Record<string, string>;
	
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
	    }
	}
	export class VideoFile {
	    name: string;
	    path: string;
	    size: number;
	    modTime: number;
	    folder: string;
	    game: string;
	
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

