---
layout: post
comments: true
description: Why Jekyll?
image:
    feature: hacker.jpg
---


---

What's a Jekyll powered blog without a 'Blogging like a hacker' post?
It's almost like a ritual. Every Jekyll powered blog in one way or
another, is inspired from [this post](http://tom.preston-werner.com/2008/11/17/blogging-like-a-hacker.html)
by [Tom Preston-Werner](http://en.wikipedia.org/wiki/Tom_Preston-Werner)(Co-founder of Github).
So why did *I* choose [Jekyll]() and [Github-Pages]() for my blog?


I warmed up to the Idea of [FOSS](http://en.wikipedia.org/wiki/Free_and_open-source_software)
and developed a liking for the open-source world a few months ago
after I got a Linux installation going on my computer.
(Why exactly did I get onto linux? I dunno, it seemed interesting)
I liked the fact that I could (not that I did) now
tweak anything and everything to my tastes. I started trying out lots of
open-source tools and languages for my recreational coding and I fell in love with a few.
While all this was happening, It looked like I might be doing a few projects
and I thought it would be a good idea to document my learning curve and also share stuff as I move
forward.


So I started looking for options. I had registered on blogspot a few years ago,
but never really knew what I wanted to
post, so it died out after a few mindless posts. So I had an idea of the
environment there and wasn't sure if that's
how I wanted to blog. Then there was the option of self-hosted Wordpress.
This was surely my territory as I had made
a [site](http://www.sjpu.com) for my school with a friend and was familiar with it.
But the backups, the pesky update reminders, managing plugins and most of all, editing your posts in the
browser based rich-text editor were a pain on Wordpress. For something as simple
as a personal blog, Wordpress didn't seem like the right choice
and Wordpress.com was pretty much the same, minus the hosting head-aches.
I considered tumblr and ended up with this.

*Blogspot = Tumblr = Wordpress.com = Self-hosted Wordpress - hosting hassles*.



None of them seemed to suit my needs.
Then, I came across Jekyll, 'a blog-aware, static site generator
written in Ruby'. It could take a bunch of [Markdown](http://daringfireball.net/projects/markdown/)
files (basically text, with a few markups) with
[YAML](http://www.yaml.org/) headers,
CSS, a little [liquid](http://liquidmarkup.org/)  here and there,
and spit out a static site into a directory you specified (the default
being the *_site* directory) and you can host it on any
damn web-server. Most people host Jekyll sites  on Github-Pages or
Amazon S3. But I was already using Github and Github runs Jekyll on it's Github-Pages, so I
could just upload the the Jekyll files and the site would
be generated automatically. So that seemed like the only logical
choice for me. I could now use emacs to write up posts in plain text and spell-check, use Git to version control
the posts and the site, push it to
Github and my post would be published!  In other words, Christmas!
All I had to do now was write a bunch of CSS and come up
with a basic html structure for the site. It seemed like a little too much
of effort for me, so I flicked the
[Balzac](https://github.com/ColeTownsend/Balzac-for-Jekyll) theme,
tweaked it a bit, a little tippy-tappy and here's my blog.


I won't be writing about the specifics of how Jekyll works and how you can make your own Jekyll powered blog.
It's been written about just too many times. [Here](http://erjjones.github.io/blog/How-I-built-my-blog-in-one-day/),
[here](http://matthodan.com/2012/10/27/how-to-create-a-blog-with-jekyll.html‎),
[here](http://www.andrewmunsell.com/tutorials/jekyll-by-example/index.html)
and a bunch of other places. But I would recommend reading the
official  [Jekyll documentation](http://jekyllrb.com/docs/home/) to get a feel
of what actually the deal is with Jekyll. If you decide on pulling a framework rather than building
your own structure like me, take a look at
[Octopress](http://octopress.org),  [Jekyllbootstrap](http://jekyllbootstrap.com/) and the
[Twitter bootstrap](http://getbootstrap.com/‎). They give you a whole
load of features and add more power to your site. But If you're
looking for something simpler, you can use any of the themes listed
[here.](http://jekyllthemes.org/themes/balzac)

Also take a look at [Ruhoh](http://ruhoh.com/‎) before you decide on anything.
The source to this blog can be found in this Github [repository.](http://github.com/upman/upman.github.com/)
You can contact me or leave a comment if you want any help with setting up any of this stuff and I'd
be happy to help.





