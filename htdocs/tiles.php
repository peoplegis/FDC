<?php

	$urls = file_get_contents('php://input');
	$aUrls = json_decode(urldecode($urls));
	$tiles = array();
	foreach ($aUrls as $szUrl) {
		$szContents = file_get_contents($szUrl);
		error_log("fetched image url ".$szUrl);
		$tiles[$szUrl] = "data:image/png;base64,".base64_encode($szContents);
	}

	header('Content-Type: application/json; charset=utf8');
	exit(json_encode($tiles));
?>
