export namespace main {
	
	export class Config {
	    folders: string[];
	    youtube_client_id: string;
	    youtube_client_secret: string;
	    youtube_token_json?: string;
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folders = source["folders"];
	        this.youtube_client_id = source["youtube_client_id"];
	        this.youtube_client_secret = source["youtube_client_secret"];
	        this.youtube_token_json = source["youtube_token_json"];
	    }
	}
	export class VideoFile {
	    name: string;
	    path: string;
	    size: number;
	    modTime: number;
	    folder: string;
	
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
	    }
	}

}

